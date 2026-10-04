(function(root,factory){
  if(typeof module==="object"&&module.exports) module.exports=factory();
  else root.SplitFlapDesigner=factory();
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const colors={"⬜":"#e8e8dd","🟥":"#d24a3f","🟧":"#e28a35","🟨":"#e9ce4b","🟩":"#59a363","🟦":"#4a7bbc","🟪":"#8c5fbb"};
  function serialize(pages,columns){
    return pages.flatMap(page=>Array.from({length:page.length/columns},(_,i)=>page.slice(i*columns,(i+1)*columns).join(""))).join("\n");
  }
  function editRow(values,columns,cursor,key){
    const cells=values.slice(),start=cursor-cursor%columns,end=start+columns-1;
    if(key===" "){
      for(let i=end;i>cursor;i--)cells[i]=cells[i-1];
      cells[cursor]=" ";
      cursor=Math.min(end,cursor+1);
    }else if(key==="Delete"||key==="Backspace"){
      if(key==="Backspace"){
        if(cursor===start)return {cells,cursor};
        cursor--;
      }
      for(let i=cursor;i<end;i++)cells[i]=cells[i+1];
      cells[end]=" ";
    }
    return {cells,cursor};
  }
  // Receives text normalized by the same layout code used on the display.
  function pasteText(values,columns,cursor,text){
    const cells=values.slice();
    let clipped=false;
    const lines=text.split("\n");
    lines.forEach((line,lineIndex)=>{
      const start=cursor;
      for(const char of Array.from(line)){
        if(cursor>=cells.length){clipped=true;break;}
        cells[cursor++]=char;
      }
      if(lineIndex<lines.length-1){
        cursor=(Math.floor(Math.max(start,cursor-1)/columns)+1)*columns;
      }
    });
    return {cells,cursor:Math.min(cells.length-1,cursor),clipped};
  }
  function selectionText(values,columns,start,end){
    let text="";
    for(let i=start;i<=end;i++){
      if(i>start&&i%columns===0)text+="\n";
      text+=values[i];
    }
    return text;
  }
  function splitLine(pages,columns,page,cursor){
    const size=pages[0].length,cells=pages.flat(),position=page*size+cursor;
    const end=position-position%columns+columns;
    const tail=cells.slice(position,end);
    cells.fill(" ",position,end);
    cells.splice(end,0,...tail,...Array(columns-tail.length).fill(" "));
    // Keep existing pages; grow only when the displaced final row contains content.
    if(end<pages.length*size&&cells.slice(pages.length*size).every(c=>c===" "))cells.length=pages.length*size;
    while(cells.length%size)cells.push(" ");
    const next=Math.min(end,cells.length-1);
    return {pages:Array.from({length:cells.length/size},(_,i)=>cells.slice(i*size,(i+1)*size)),page:Math.floor(next/size),cursor:next%size};
  }
  function quote(value){return "'"+String(value).replace(/'/g,"'\\''")+"'";}
  function curl(origin,command,auth){
    const args=["curl --fail-with-body "+quote(origin+"/api/message")];
    if(auth) args.push('-H "Authorization: Bearer $SPLITFLAP_WEB_TOKEN"');
    args.push("-H 'Content-Type: application/json'","--data-raw "+quote(JSON.stringify(command)));
    return args.join(" \\\n  ");
  }
  return {colors,serialize,editRow,pasteText,selectionText,splitLine,quote,curl};
});
