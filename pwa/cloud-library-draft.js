// A library edit owns its membership and metadata until one atomic commit.
export function createLibraryDraft(library, entries) {
  const original = entries.map(e => e.figure_id), ids = [...original];
  const baseline = { title: library.title, description: library.description ?? '', visibility: library.visibility, collaborative: !!library.collaborative, moderated: !!library.moderated };
  const data = { ...baseline }, known = new Map(entries.map(e => [e.figure_id, e])), additions = new Map();
  return {
    data, known,
    get ids() { return [...ids]; },
    get dirty() { return JSON.stringify(data) !== JSON.stringify(baseline) || ids.length !== original.length || ids.some((id,i) => original[i] !== id); },
    move(id, index) { const from=ids.indexOf(id); if(from<0||index<0||index>=ids.length||from===index)return false;ids.splice(from,1);ids.splice(index,0,id);return true; },
    add(figure) {
      const revision=figure.revisions?.[0];if(!revision||ids.includes(figure.id))return false;
      known.set(figure.id,{figure_id:figure.id,owner_id:figure.owner_id,public_allowed:figure.public_allowed,published:revision});
      if(!original.includes(figure.id))additions.set(figure.id,revision.id);ids.push(figure.id);return true;
    },
    remove(id) { const i=ids.indexOf(id);if(i<0)return false;ids.splice(i,1);return true; },
    payload() { return { id:library.id,...data,expected_version:library.edit_version,order:[...ids],additions:ids.filter(id=>additions.has(id)).map(id=>({figure:id,revision:additions.get(id)})) }; }
  };
}
