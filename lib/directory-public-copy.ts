const technical =
  /^(?:stav overenia|(?:čiastočne\s+)?overené(?:\s+psipediou)?|neoverené|overenie údajov|dátum (?:kontroly|overenia)|import[_ ]?key|source_data_json|technický pôvod|(?:profil|údaje) (?:boli? |je )?(?:importovan|synchronizovan)|(?:notion|gemini|tavily)(?:\s|:))/iu;
const source =
  /^(?:zdroj(?: overenia| údajov)?|informácie (?:z|podľa)|údaje (?:z|podľa)|podľa (?:webu|verejn))/iu;

export function directoryQualificationSections(items: readonly string[]) {
  const qualifications: string[] = [];
  const sources: string[] = [];
  for (const item of items) {
    const text = item.trim();
    if (!text || technical.test(text)) continue;
    if (source.test(text)) sources.push(text.replace(/^zdroj(?: overenia| údajov)?\s*:\s*/iu, ""));
    else qualifications.push(text);
  }
  return {
    qualifications: [...new Set(qualifications)],
    sources: [...new Set(sources)].filter(Boolean),
  };
}
