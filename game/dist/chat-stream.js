/** Read newline-delimited JSON across arbitrary UTF-8 and network chunk boundaries. */
export async function* chatFrames(body) {
  const reader=body.getReader(), decoder=new TextDecoder();
  let rest='';
  try {
    while (true) {
      const {value,done}=await reader.read();
      rest+=decoder.decode(value,{stream:!done});
      const lines=rest.split('\n');
      rest=lines.pop();
      for (const line of lines) if(line.trim()) yield JSON.parse(line);
      if (done) break;
      if (rest.length>65536) throw new Error('Incomplete chat frame');
    }
    if(rest.trim()) yield JSON.parse(rest);
  } finally { reader.releaseLock(); }
}
