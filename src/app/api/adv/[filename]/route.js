import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const ADV_DIR = path.resolve(process.cwd(), '../res/adv/resource');

export async function GET(request, props) {
  try {
    const params = await props.params;
    const { filename } = params;
    
    // Safety check
    if (!filename.endsWith('.txt') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const filePath = path.join(ADV_DIR, filename);
    
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const content = await fs.readFile(filePath, 'utf-8');
    
    // Parse the ADV file content to extract messages
    const lines = content.split('\n');
    const parsedEntries = [];
    
    lines.forEach((line, index) => {
      line = line.trim();
      if (!line) return;
      
      // Basic parser for [message], [choice], [title], [narration]
      if (line.startsWith('[message ') || line.startsWith('[choice ') || line.startsWith('[title ') || line.startsWith('[narration ')) {
        let type = '';
        if (line.startsWith('[message')) type = 'message';
        else if (line.startsWith('[choice')) type = 'choice';
        else if (line.startsWith('[title')) type = 'title';
        else if (line.startsWith('[narration')) type = 'narration';
        
        let text = '';
        let name = '';

        if (type === 'title') {
          const titleMatch = line.match(/title=(.*?)(?:\s+[a-zA-Z_0-9]+=|\])/);
          text = titleMatch ? titleMatch[1].trim() : '';
        } else {
          // Extract text using better regex
          const textMatch = line.match(/text=(.*?)(?:\s+[a-zA-Z_0-9]+=|\])/);
          // Extract name
          const nameMatch = line.match(/name=(.*?)(?:\s+[a-zA-Z_0-9]+=|\])/);
          
          text = textMatch ? textMatch[1].trim() : '';
          name = nameMatch ? nameMatch[1].trim() : '';
        }
        
        // Clean up quotes if present
        if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
        if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);
        
        parsedEntries.push({
          lineIndex: index,
          type,
          name,
          original: text,
          fullLine: line
        });
      }
    });

    return NextResponse.json({
      filename,
      entries: parsedEntries
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
