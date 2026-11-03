import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Build-time, read-only source inventory. No runtime D1, network, browser,
 * publication or modification of public styling.
 *
 * "Exact source" means byte-for-byte identical file text.
 * "Exact CSS" means identical declarations in different files in the same
 * at-rule context; NOT equivalent specificity, HTML or rendered appearance.
 * "JSX shape" means matching tags + attribute names ignoring data/text.
 */
const VISUAL_EXT = /\.(?:tsx|jsx)$/;
const STYLE_EXT = /\.css$/;
const OMIT = new Set(["node_modules", ".next", ".git", "dist", "generated", "__tests__"]);
const MAX_JSX_TOKENS = 12000;

function relative(root, target) {
  return path.relative(root,target).split(path.sep).join("/");
}
function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function walkStyles(root, dirs = ["app", "components", "styles", "lib"]) {
  const found = [];
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir,{withFileTypes:true})) {
      if (item.name.startsWith(".") || OMIT.has(item.name)) continue;
      const file = path.join(dir,item.name);
      if (item.isDirectory()) visit(file);
      else if (item.isFile() && STYLE_EXT.test(file)) found.push(file);
    }
  };
  for(const dir of dirs) visit(path.join(root,dir));
  return found.sort();
}
function jsxInformation(file, source) {
  const tree = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,
    file.endsWith(".jsx")?ts.ScriptKind.JSX:ts.ScriptKind.TSX);
  const tokens = [];
  const featureCounts = new Map();
  let jsxElements=0;
  const add = (name) => featureCounts.set(name,(featureCounts.get(name)??0)+1);
  const scan = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = ts.isJsxElement(node)?node.openingElement:node;
      const tag = open.tagName.getText(tree).toLowerCase();
      const attrs = open.attributes.properties
        .filter(ts.isJsxAttribute)
        .map(p=>p.name.getText(tree).toLowerCase()).sort();
      // stable order of actual tags; ignore mutable text and attributes' values
      tokens.push("T:"+tag, ...attrs.map(a=>"A:"+a));
      add("T:"+tag);
      for (const a of attrs) add("A:"+a);
      jsxElements++;
    } else if (ts.isJsxFragment(node)) {
      tokens.push("F:fragment");
      add("F:fragment");
    }
    if (tokens.length < MAX_JSX_TOKENS) ts.forEachChild(node,scan);
  };
  scan(tree);
  return {jsxElements, shape:tokens.join("|"),features:[...featureCounts.keys()].sort()};
}
function moduleKind(file) {
  if (/^app\/.*\/page\.[jt]sx$|^app\/page\.[jt]sx$/.test(file)) return "page";
  if (/^app\/.*\/layout\.[jt]sx$|^app\/layout\.[jt]sx$/.test(file)) return "layout";
  if (/^app\/.*\/(?:loading|error|not-found|template|default)\.[jt]sx$/.test(file)) return "route-shell";
  if (file.startsWith("components/")) return "component";
  if (file.startsWith("app/")) return "app-module";
  if (file.startsWith("lib/")) return "lib-jsx";
  return "other-jsx";
}
function collapseWhitespace(text) { return text.trim().replace(/\s+/g," "); }

/** Scan braces/semicolons outside strings, comments and parentheses.
 * This is a conservative CSS declaration scanner, not a CSS renderer. */
export function scanCssRules(css, file) {
  const stack = [];
  const rules=[];
  let segmentStart=0, line=1, comment=false,quote=null,escape=false,paren=0;
  let segmentLine=1;
  const appendDecl = (end) => {
    if(!stack.length)return;
    const block=stack[stack.length-1];
    const raw=css.slice(segmentStart,end).trim();
    const colon=raw.indexOf(":");
    if(colon <= 0)return;
    const prop=collapseWhitespace(raw.slice(0,colon)).toLowerCase();
    const value=collapseWhitespace(raw.slice(colon+1));
    if(!/^[-a-zA-Z_][\w-]*$/.test(prop)||!value||prop.startsWith("@"))return;
    block.declarations.push({prop,value});
  };
  for(let i=0;i<css.length;i++){
    const ch=css[i],next=css[i+1];
    if(ch==="\n")line++;
    if(comment){
      if(ch==="*" && next==="/"){comment=false;i++;}
      continue;
    }
    if(quote){
      if(escape)escape=false;
      else if(ch==="\\")escape=true;
      else if(ch===quote)quote=null;
      continue;
    }
    if(ch==="/"&&next==="*"){comment=true;i++;continue;}
    if(ch==="'"||ch==='"'){quote=ch;continue;}
    if(ch==="("){paren++;continue;}
    if(ch===")"&&paren>0){paren--;continue;}
    if(paren)continue;
    if(ch==="{"){
      const head=collapseWhitespace(css.slice(segmentStart,i));
      stack.push({header:head,line:segmentLine,declarations:[]});
      segmentStart=i+1;segmentLine=line;
    }else if(ch===";"){
      appendDecl(i);segmentStart=i+1;segmentLine=line;
    }else if(ch==="}"){
      appendDecl(i);
      const block=stack.pop();
      if(block && block.declarations.length){
        const props=new Set(block.declarations.map(d=>d.prop));
        // Duplicate properties are order-sensitive; do not certify equivalence.
        const noCascade=props.size===block.declarations.length;
        const declarations=block.declarations.map(d=>d.prop+":"+d.value).sort();
        const contexts=stack.map(s=>s.header).filter(h=>h.startsWith("@"));
        const isKeyframe=contexts.some(h=>/^@(?:-webkit-)?keyframes\b/.test(h));
        if(!block.header.startsWith("@") && !isKeyframe) rules.push({
          file,selector:block.header,line:block.line,
          propertyCount:props.size,
          fingerprint:noCascade&&props.size>=4
            ? sha(contexts.join(" > ")+"|"+declarations.join(";")) : null,
          context:contexts.join(" > "),
          declarations,
        });
      }
      segmentStart=i+1;segmentLine=line;
    }
  }
  return rules;
}
function auditCss(root) {
  const paths=walkStyles(root);
  const byFingerprint=new Map(),files=[];
  let rulesScanned=0;
  for(const absolute of paths){
    const file=relative(root,absolute);
    const parsed=scanCssRules(fs.readFileSync(absolute,"utf8"),file);
    rulesScanned+=parsed.length;
    files.push({path:file,rules:parsed.length});
    for(const rule of parsed){
      if(!rule.fingerprint)continue;
      const group=byFingerprint.get(rule.fingerprint)??[];
      group.push(rule);
      byFingerprint.set(rule.fingerprint,group);
    }
  }
  const groups=[];
  for(const [id,rules] of byFingerprint){
    const differentFiles=new Set(rules.map(r=>r.file));
    if(differentFiles.size<2)continue;
    const first=rules[0];
    groups.push({
      id,
      propertyCount:first.propertyCount,
      declarations:first.declarations,
      context:first.context,
      members:rules.map(({file,selector,line})=>({file,selector,line}))
        .sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line),
      filesCount:differentFiles.size,
    });
  }
  groups.sort((a,b)=>b.filesCount-a.filesCount||
    b.propertyCount-a.propertyCount||a.id.localeCompare(b.id));
  return {files,rulesScanned,exactDeclarationGroups:groups};
}
function pairsFromGroupMap(groups,kind) {
  const result=[];
  for(const [id,files] of groups){
    if(files.length<2)continue;
    result.push({
      id,kind,
      files:[...new Set(files)].sort(),
      count:new Set(files).size,
    });
  }
  return result.filter(g=>g.count>1).sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
}
/** Detect shared JSX structure without claiming rendered equality. */
export function auditVisualSources(root, absoluteFiles, registeredComponents, usedBy) {
  const modules=[];
  const byRaw=new Map(),byShape=new Map();
  const registered=new Set(registeredComponents.map(c=>c.path));
  for(const absolute of absoluteFiles){
    if(!VISUAL_EXT.test(absolute))continue;
    const file=relative(root,absolute);
    const source=fs.readFileSync(absolute,"utf8");
    const meta=jsxInformation(file,source);
    if(!meta.jsxElements)continue;
    const routes=[...(usedBy.get(file)??[])].sort();
    const item={
      path:file,role:moduleKind(file),registered:registered.has(file),
      jsxElements:meta.jsxElements,routes,
    };
    modules.push(item);
    const rawId=sha(source);
    byRaw.set(rawId,[...(byRaw.get(rawId)??[]),file]);
    if(meta.jsxElements>=8 && meta.shape.length>=60){
      const shapeId=sha(meta.shape);
      byShape.set(shapeId,[...(byShape.get(shapeId)??[]),file]);
    }
  }
  modules.sort((a,b)=>a.path.localeCompare(b.path));
  const sourceExact=pairsFromGroupMap(byRaw,"identical-file");
  const jsxShapes=pairsFromGroupMap(byShape,"identical-jsx-shape");
  const css=auditCss(root);
  return {
    version:1,
    totals:{
      jsxFiles:modules.length,
      componentsIndexed:modules.filter(m=>m.registered).length,
      otherJsxFiles:modules.filter(m=>!m.registered).length,
      cssFiles:css.files.length,
      cssRules:css.rulesScanned,
      exactCssGroups:css.exactDeclarationGroups.length,
      exactSourceGroups:sourceExact.length,
      matchingJsxStructureGroups:jsxShapes.length,
    },
    modules,cssFiles:css.files,
    identicalSourceGroups:sourceExact,
    similarStructureGroups:jsxShapes,
    exactCssDeclarationGroups:css.exactDeclarationGroups,
  };
}
