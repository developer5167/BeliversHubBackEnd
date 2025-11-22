// src/worker/transcodeWorker.ts
/**
 * Full ffmpeg-based worker:
 * - downloads uploaded video from R2
 * - probes with ffprobe
 * - produces mp4 ABR variants (1080p optional), HLS, thumbnails
 * - uploads generated files back to R2
 * - inserts media, media_variants, thumbnails rows
 * - updates upload_sessions status
 *
 * NOTE: Ensure ffmpeg & ffprobe are installed on the worker machine.
 */

import { Worker } from "bullmq";
import { db } from "../db/index";
import { eq } from "drizzle-orm";

import {
  upload_sessions,
  media as mediaTable,
  media_variants as variantsTable,
  thumbnails as thumbnailsTable,
  posts as postsTable,
} from "../db/schema";
import { getObject, s3 } from "../s3Client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";
import util from "util";
import dotenv from "dotenv";
dotenv.config();

const execFile = util.promisify(require("child_process").execFile);
const connection = { host: process.env.REDIS_HOST || "127.0.0.1", port: Number(process.env.REDIS_PORT || 6379) };
const BUCKET = process.env.R2_BUCKET!;
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE || ""; // optional base URL prefix if you want absolute URLs
const MAX_VARIANTS = 4; // including original if you keep it

// variants config - you can tune bitrates
const VARIANTS = [
  { name: "1080p", height: 1080, bitrate: "4500k" }, // optional
  { name: "720p", height: 720, bitrate: "2500k" },
  { name: "480p", height: 480, bitrate: "900k" },
  { name: "360p", height: 360, bitrate: "400k" },
];

// Helper: upload a file stream to R2
async function uploadFileToR2(localPath: string, destKey: string, contentType = "video/mp4") {
  const stream = fs.createReadStream(localPath);
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: destKey,
    Body: stream,
    ContentType: contentType,
  });
  await s3.send(cmd);
  const url = PUBLIC_BASE ? `${PUBLIC_BASE}/${destKey}` : destKey;
  return url;
}

// Helper: run ffprobe and parse JSON
async function ffprobeJSON(filePath: string) {
  // ffprobe -v error -show_format -show_streams -print_format json input
  const { stdout } = await execFile("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=width,height,codec_type,codec_name",
    "-of",
    "json",
    filePath,
  ]);
  return JSON.parse(stdout);
}

// Helper: spawn ffmpeg with args, await exit
function runFFmpeg(args: string[], cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    const cp = spawn("ffmpeg", args, { stdio: "inherit", cwd });
    cp.on("error", (err) => reject(err));
    cp.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code} (args: ${args.join(" ")})`));
    });
  });
}

// Helper: create directory (recursive)
async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function downloadFromR2ToTmp(bucket: string, key: string) {
  const obj = await getObject(bucket, key);
  const body = obj.Body as any;
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "upload-"));
  const outPath = path.join(tmpDir, "input" + path.extname(key || ".mp4"));
  const write = fs.createWriteStream(outPath);
  await pipeline(body, write);
  return { tmpDir, outPath };
}

const worker = new Worker(
  "video-processing",
  async (job) => {
    console.log("Worker job received:", job.id, job.data);
    const { uploadSessionId, fileKey, userId, bucket } = job.data;

    const session = await db
          .select()
          .from(upload_sessions)
          .where(eq(upload_sessions.id, uploadSessionId));
    
    // fetch upload session record
    // const session = await db.select().from(upload_sessions).where(upload_sessions.id.eq(uploadSessionId)).get();
    if (!session) throw new Error("upload_session not found");

    // Idempotency: if already done, skip
    if (session.status === "done") {
      console.log("Session already done:", uploadSessionId);
      return { ok: true };
    }


    await db
      .update(upload_sessions)
      .set({ status: "processing" })
      .where(eq(upload_sessions.id, uploadSessionId));
    // mark processing
    // await db.update(upload_sessions).set({ status: "processing", updated_at: new Date() }).where(upload_sessions.id.eq(uploadSessionId)).run();

    const bucketToUse = bucket || BUCKET;

    let tmpDir = "";
    try {
      // 1) download
      const dl = await downloadFromR2ToTmp(bucketToUse, fileKey);
      tmpDir = dl.tmpDir;
      const inputFile = dl.outPath;
      console.log("Downloaded input to:", inputFile);

      // 2) ffprobe
      const probe = await ffprobeJSON(inputFile);
      const format = probe.format || {};
      const streams = probe.streams || [];
      const videoStream = streams.find((s: any) => s.codec_type === "video") || {};
      const durationSec = Math.round(Number(format.duration || 0));
      const width = videoStream.width || 0;
      const height = videoStream.height || 0;
      console.log({ durationSec, width, height, codec: videoStream.codec_name });

      // guardrails
      const MAX_DURATION = Number(process.env.MAX_VIDEO_DURATION_SEC || 60 * 60); // default 60 min
      if (durationSec > MAX_DURATION) {
        throw new Error(`max duration exceeded: ${durationSec} > ${MAX_DURATION}`);
      }

      // create outputs dir
      const outDir = path.join(tmpDir, "out");
      await ensureDir(outDir);

      // 3) generate thumbnails (3) evenly spaced
      const thumbs: { path: string; key: string }[] = [];
      const thumbCount = 3;
      const spacing = Math.max(1, Math.floor(durationSec / (thumbCount + 1)));
      for (let i = 1; i <= thumbCount; i++) {
        const time = Math.min(durationSec - 1, i * spacing);
        const tpath = path.join(outDir, `thumb_${i}.jpg`);
        // ffmpeg -ss TIME -i input -frames:v 1 -q:v 2 out.jpg
        await runFFmpeg(["-y", "-ss", String(time), "-i", inputFile, "-frames:v", "1", "-q:v", "2", tpath]);
        thumbs.push({ path: tpath, key: `processed/${userId}/${uploadSessionId}/thumbnails/thumb_${i}.jpg` });
      }
      console.log("Thumbnails generated:", thumbs.map(t => t.path));

      // 4) create MP4 variants
      const producedVariants: { quality: string; path: string; key: string; size: number }[] = [];
      // choose which variants to produce based on input height
      const targetVariants = VARIANTS.filter(v => v.height <= (height || 10000));
      for (const v of targetVariants) {
        const outFile = path.join(outDir, `video_${v.name}.mp4`);
        // ffmpeg -i input -c:v libx264 -preset medium -b:v BITRATE -maxrate BITRATE -bufsize (2*bitrate) -vf scale=-2:HEIGHT -c:a aac -b:a 128k out.mp4
        const maxrate = v.bitrate;
        const bufsize = String(Math.round(parseInt(v.bitrate) * 2)) + "k";
        const args = [
          "-y",
          "-i",
          inputFile,
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-b:v",
          v.bitrate,
          "-maxrate",
          v.bitrate,
          "-bufsize",
          bufsize,
          "-vf",
          `scale=-2:${v.height}`,
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          outFile,
        ];
        await runFFmpeg(args);
        const stat = await fs.promises.stat(outFile);
        producedVariants.push({
          quality: v.name,
          path: outFile,
          key: `processed/${userId}/${uploadSessionId}/variants/video_${v.name}.mp4`,
          size: stat.size,
        });
        console.log("Produced variant:", outFile);
      }

      // 5) create HLS master + variant playlists
      // Use ffmpeg HLS output with var_stream_map
      const hlsDir = path.join(outDir, "hls");
      await ensureDir(hlsDir);
      // Build var_stream_map and args dynamically for producedVariants
      // We'll create separate playlists per quality inside hls/v{idx}/prog_index.m3u8 and a master playlist
      const variantArgs: string[] = ["-y", "-i", inputFile];
      // build mappings and output settings
      producedVariants.forEach((v, idx) => {
        const heightMatch = v.quality.replace("p", "");
        // map as separate output stream
        variantArgs.push(
          "-map",
          "0:v:0",
          "-map",
          "0:a:0",
          "-c:v",
          "libx264",
          "-b:v",
          // keep same bitrate as mp4 variant or slightly less, use same value
          VARIANTS.find(x => x.name === v.quality)?.bitrate || "900k",
          "-maxrate",
          VARIANTS.find(x => x.name === v.quality)?.bitrate || "900k",
          "-bufsize",
          "1835k",
          "-vf",
          `scale=-2:${v.quality.replace("p", "")}`,
        );
      });

      // build hls specific args: -f hls -hls_time 6 -hls_playlist_type vod -hls_segment_filename hls/v%v/seg_%03d.ts -master_pl_name master.m3u8 -var_stream_map "v:0,a:0 v:1,a:0"
      // But simpler approach: generate individual HLS for each variant and then craft a master playlist
      const hlsVariantInfos: { name: string; dir: string; playlistKey: string }[] = [];
      for (const v of producedVariants) {
        const vDir = path.join(hlsDir, v.quality);
        await ensureDir(vDir);
        const playlistPath = path.join(vDir, "index.m3u8");
        // ffmpeg -i input -c:v libx264 -b:v BITRATE -vf scale=-2:HEIGHT -c:a aac -hls_time 6 -hls_playlist_type vod vDir/index.m3u8
        const vbitrate = VARIANTS.find(x => x.name === v.quality)?.bitrate || "900k";
        await runFFmpeg([
          "-y",
          "-i",
          inputFile,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-b:v",
          vbitrate,
          "-maxrate",
          vbitrate,
          "-bufsize",
          "1835k",
          "-vf",
          `scale=-2:${v.quality.replace("p", "")}`,
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-f",
          "hls",
          "-hls_time",
          "6",
          "-hls_playlist_type",
          "vod",
          "-hls_segment_filename",
          path.join(vDir, "segment_%03d.ts"),
          playlistPath,
        ]);
        hlsVariantInfos.push({
          name: v.quality,
          dir: vDir,
          playlistKey: `processed/${userId}/${uploadSessionId}/hls/${v.quality}/index.m3u8`,
        });
        console.log("Created HLS for", v.quality, "->", playlistPath);
      }

      // create master playlist content referencing variant playlists
      // We'll upload the variant playlists and segments, and then upload a generated master.m3u8
      // 6) Upload artifacts to R2
      const uploadedVariants: { quality: string; url: string; size: number }[] = [];

      // upload mp4 variants
      for (const pv of producedVariants) {
        const url = await uploadFileToR2(pv.path, pv.key, "video/mp4");
        uploadedVariants.push({ quality: pv.quality, url, size: pv.size });
      }

      // upload thumbnails
      const uploadedThumbs: { url: string; is_selected: boolean }[] = [];
      for (const t of thumbs) {
        const url = await uploadFileToR2(t.path, t.key, "image/jpeg");
        const is_selected = false; // default; user can select later
        uploadedThumbs.push({ url, is_selected });
      }

      // upload HLS files: playlists & segments for each variant
      // Walk each hls variant directory and upload files
      for (const info of hlsVariantInfos) {
        const localDir = path.join(outDir, "hls", info.name);
        const items = await fs.promises.readdir(localDir);
        for (const item of items) {
          const localFile = path.join(localDir, item);
          const relKey = `processed/${userId}/${uploadSessionId}/hls/${info.name}/${item}`;
          // determine content type
          const ext = path.extname(item).toLowerCase();
          const contentType = ext === ".m3u8" ? "application/vnd.apple.mpegurl" : ext === ".ts" ? "video/MP2T" : "application/octet-stream";
          await uploadFileToR2(localFile, relKey, contentType);
        }
      }

      // create master playlist content - reference the uploaded playlist keys we created
      // master playlist needs bandwidth info; use a simple variant declaration (approx bandwidth from bitrate)
      let masterContent = "";
      for (const uv of uploadedVariants) {
        const bitrateEstimate = Number(uv.size / Math.max(1, durationSec)) * 8; // bytes/sec -> bits/sec estimate
        // find corresponding HLS playlist key
        const quality = uv.quality;
        const playlistKey = `processed/${userId}/${uploadSessionId}/hls/${quality}/index.m3u8`;
        masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(bitrateEstimate)}\n${playlistKey}\n`;
      }
      const masterPath = path.join(outDir, "master.m3u8");
      await fs.promises.writeFile(masterPath, masterContent, "utf8");
      const masterKey = `processed/${userId}/${uploadSessionId}/hls/master.m3u8`;
      await uploadFileToR2(masterPath, masterKey, "application/vnd.apple.mpegurl");

      // 7) Insert DB rows: media, media_variants, thumbnails
      const insertedMedia = await db
        .insert(mediaTable)
        .values({
          post_id: null,
          upload_session_id: uploadSessionId,
          type: "video",
          duration_sec: durationSec,
          width,
          height,
        })
        .returning()
       .execute();

      const mediaId = insertedMedia[0].id;
      console.log("Inserted media id:", mediaId);

      // insert variants
      for (const uv of uploadedVariants) {
        await db.insert(variantsTable).values({
          media_id: mediaId,
          quality: uv.quality,
          url: uv.url,
          size_bytes: uv.size,
        }).execute();
      }

      // insert thumbnails
      for (const ut of uploadedThumbs) {
        await db.insert(thumbnailsTable).values({
          media_id: mediaId,
          url: ut.url,
          is_selected: ut.is_selected,
        }).execute();
      }
      await db
      .update(upload_sessions)
      .set({ status: "done" })
      .where(eq(upload_sessions.id, uploadSessionId));

      // finally update upload_session -> done
    //   await db.update(upload_sessions).set({ status: "done", updated_at: new Date() }).where(upload_sessions.id.eq(uploadSessionId)).run();

      // cleanup tmp
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch (e) {
        console.warn("cleanup failed", e);
      }

      return { ok: true, mediaId };
    } catch (err) {
      console.error("Worker processing error:", err);
      // update session failed
      try {
        if (session && uploadSessionId) {
               await db
      .update(upload_sessions)
      .set({ status: "failed" })
      .where(eq(upload_sessions.id, uploadSessionId)).execute();
        //   await db.update(upload_sessions).set({ status: "failed", updated_at: new Date() }).where(upload_sessions.id.eq(uploadSessionId)).execute();
        }
      } catch (e) {
        console.error("Failed to mark upload_session failed", e);
      }
      // cleanup
      if (tmpDir) {
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (e) {}
      }
      throw err;
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log("Job completed:", job.id);
});
worker.on("failed", (job, err) => {
  console.error("Job failed:", job?.id, err);
});

console.log("Transcode worker started.");
