/** Small dependency-free evaluator for the scope expressions actually used by our YAML.
 * It rejects unsupported syntax rather than pretending an unparsed condition passed.
 */
export function evaluateCondition(expression = 'true', context = {}) {
  const source = expression.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const tokens = []; let rest = source;
  while (rest.trim()) {
    rest = rest.trimStart();
    const match = rest.match(/^(?:'(?:[^']|'')*'|"[^"]*"|&&|\|\||==|!=|[(),!]|[A-Za-z_][\w.-]*)/);
    if (!match) throw new Error(`Unsupported CI expression: ${rest}`);
    tokens.push(match[0]); rest = rest.slice(match[0].length);
  }
  let i = 0;
  const consume = (token) => { if (tokens[i++] !== token) throw new Error(`Expected ${token}`); };
  function atom() {
    const token = tokens[i++];
    if (token === '!') return !atom();
    if (token === '(') { const value = or(); consume(')'); return value; }
    if (token?.startsWith("'") || token?.startsWith('"')) return token.slice(1, -1);
    if (token === 'true' || token === 'false') return token === 'true';
    if (!token) throw new Error('Missing expression operand');
    if (tokens[i] === '(') {
      i++; const args = [];
      while (tokens[i] !== ')') { args.push(or()); if (tokens[i] !== ',') break; i++; }
      consume(')');
      if (token === 'always') return true;
      if (token === 'success') return (context.status || 'success') === 'success';
      if (token === 'failure') return context.status === 'failure';
      if (token === 'contains') return String(args[0]).includes(args[1]);
      if (token === 'startsWith') return String(args[0]).startsWith(args[1]);
      throw new Error(`Unsupported CI function: ${token}`);
    }
    return token.split('.').reduce((value, key) => value?.[key], context) ?? '';
  }
  function equality() { let v = atom(); while (['==', '!='].includes(tokens[i])) { const op = tokens[i++]; const r = atom(); v = op === '==' ? v === r : v !== r; } return v; }
  function and() { let v = equality(); while (tokens[i] === '&&') { i++; const r = equality(); v = Boolean(v && r); } return v; }
  function or() { let v = and(); while (tokens[i] === '||') { i++; const r = and(); v = Boolean(v || r); } return v; }
  const value = or();
  if (i !== tokens.length) throw new Error('Unparsed CI condition tokens');
  return Boolean(value);
}

/** Extract actual job/step conditions; this is not a replacement for YAML validation. */
export function workflowConditions(source) {
  const body = source.slice(source.indexOf('\njobs:\n') + 7);
  return [...body.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)].map((match) => {
    const block = match[2];
    let condition = block.match(/^    if: (.+)$/m)?.[1];
    if (condition === '>-' || condition === '|') condition = block.match(/^    if: (?:>-|\|)\n((?:      .+\n)+)/m)[1].trim().replace(/\n\s*/g, ' ');
    const steps = [...block.matchAll(/^      - (.+)\n([\s\S]*?)(?=^      - |$(?![\s\S]))/gm)].map((step) => ({
      name: step[1].startsWith('name: ') ? step[1].slice(6) : step[2].match(/^        name: (.+)$/m)?.[1] || step[1],
      condition: step[2].match(/^        if: (.+)$/m)?.[1] || 'true', block: step[2],
    }));
    return { id: match[1], condition: condition || 'true', steps, block };
  });
}
