// Fetch the four CC0 mesh packs used by build-human.mjs.
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
const cache=new URL('../assets-src/makehuman/community/',import.meta.url);
await mkdir(cache,{recursive:true});
const hashes={
  pants01:'e4e0ec60db34f279be291a83cfd7b342a7c5cf09bb7676682a5f39f4f6ac4ad9',
  shirts01:'a5a723b0e84a109bb190fcfeac7f1de4138d875da3e30fe5b3340eac9f38bcd3',
  shoes01:'ded3f70428505eabbf1f6d7b5f61196a7366ef20757103d276ad0ed336c35ada',
  skirts01:'293fa0c15e28e8dcea8dfff20cae31aa4b0d1268a6e6ba0a53a92ebb0f36c882'
};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [pack,expected] of Object.entries(hashes)){
  const target=new URL(pack+'.zip',cache);
  const existing=await readFile(target).catch(e=>{if(e.code!=='ENOENT')throw e;});
  if(existing && hash(existing)===expected)continue;
  let error;
  for(const host of ['files2','files']){
    try{
      const response=await fetch('https://'+host+'.makehumancommunity.org/asset_packs/'+pack+'/'+pack+'_cc0.zip');
      if(!response.ok)throw Error(response.statusText);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(hash(bytes)!==expected)throw Error('Unexpected archive checksum');
      const temp=new URL(pack+'-'+process.pid+'.part',cache);
      await writeFile(temp,bytes);await rename(temp,target);
      error=null;break;
    }catch(e){error=e;}
  }
  if(error)throw Error('Could not fetch '+pack,{cause:error});
}
