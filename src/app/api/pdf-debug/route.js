import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Save the uploaded file temporarily
    const bytes = await file.arrayBuffer();
    const tempFilePath = path.join(os.tmpdir(), `debug_${Date.now()}.pdf`);
    fs.writeFileSync(tempFilePath, Buffer.from(bytes));

    // Path to Python script
    const scriptPath = path.join(process.cwd(), 'scripts', 'extract_colors.py');

    // Run Python script with PyMuPDF
    const pythonProcess = spawn('python', [scriptPath, tempFilePath]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    const exitCode = await new Promise((resolve) => {
      pythonProcess.on('close', resolve);
    });

    // Clean up temp file
    fs.unlinkSync(tempFilePath);

    if (exitCode !== 0) {
      console.error('Python script error:', errorOutput);
      return NextResponse.json({ error: 'Failed to extract colors', details: errorOutput }, { status: 500 });
    }

    const result = JSON.parse(output);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}