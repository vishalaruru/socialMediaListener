import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';

/**
 * API route to serve media files from the 'scraped_data' directory.
 * This allows serving files stored outside of the public directory.
 * 
 * Usage: /api/media/live_media/[filename]
 *    or: /api/media/2026-03-30/media/[filename]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const mediaPath = resolvedParams.path.join('/');
  const fullPath = path.join(process.cwd(), 'scraped_data', mediaPath);

  try {
    // Validate that the request is not trying to escape the scraped_data directory
    const resolvedPath = path.resolve(fullPath);
    const rootPath = path.resolve(path.join(process.cwd(), 'scraped_data'));
    
    if (!resolvedPath.startsWith(rootPath)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      return new NextResponse('File not found', { status: 404 });
    }

    const stat = await fs.stat(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    
    // Determine content type
    let contentType = 'application/octet-stream';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.mp4') contentType = 'video/mp4';
    else if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.mov') contentType = 'video/quicktime';
    else if (ext === '.pdf') contentType = 'application/pdf';

    // Stream the file
    const stream = createReadStream(fullPath);
    
    // Convert Node.js ReadStream to a Web ReadableStream
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving media:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
