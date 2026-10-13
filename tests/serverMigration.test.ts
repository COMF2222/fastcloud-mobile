import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCloud } from '../src/types.ts';
import { recoverServerFields, LEGACY_SERVER, CURRENT_SERVER } from '../src/serverMigration.ts';
test('the known server recovery retains cached fields and newer pending edits without inventing aggregate listening data',()=>{
  const cloud=emptyCloud(); cloud.preferences={theme:'Dark'}; cloud.folders={saved:{name:'Mine',playlistIds:[1],order:0,pinned:false}};
  const pending={preferences:{theme:'Light'}};
  const recovered=recoverServerFields(cloud,pending,LEGACY_SERVER,CURRENT_SERVER,emptyCloud());
  assert.equal(recovered.preferences?.theme,'Light'); assert.equal((recovered.folders?.saved as {name:string}).name,'Mine');
  assert.deepEqual(pending,{preferences:{theme:'Light'}}); assert.equal('stats' in recovered,false);
  assert.equal(recoverServerFields(cloud,pending,'https://another.example',CURRENT_SERVER,emptyCloud()),pending);
  const remote=emptyCloud(); remote.preferences={theme:'Light'};
  const second=recoverServerFields(cloud,{},LEGACY_SERVER,CURRENT_SERVER,remote);
  assert.equal(second.preferences?.theme,undefined, 'A stale second device must not replace already recovered preferences');
});
