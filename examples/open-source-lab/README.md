# Psipedia Open Source Lab — neprodukčný pilot

Izolované lokálne demo desiatich vybraných open-source projektov, **nie náhrada produkčných komponentov**:

1. Radix UI (dialóg)
2. TanStack Table (model tabuľky)
3. Zod (validácia)
4. TanStack Virtual (virtualizácia)
5. React Dropzone (viac fotografií)
6. dnd-kit (poradie fotografií)
7. React Hook Form (formulár)
8. Fuse.js (tolerancia preklepov)
9. Lucide (ikony)
10. Lexical (textový editor)

Používa React 19 ako hlavný web. Nesiahne na D1, Notion, produkčné API, Cloudflare ani existujúci blokový editor.
Balíky sú v samostatnom package.json, takže **nemeníme koreňový lockfile ani produkčný bundle**.

Lokálne spustenie:

```bash
cd examples/open-source-lab
npm install --no-package-lock
npm run dev
```

Pred nasadením do reálneho UI: vybrať len odôvodnené knižnice, v koreňovom projekte vytvoriť riadny aktualizovaný `package-lock.json` pomocou `npm install`, porovnať bundle/LCP, absolvovať a11y a 320/390px testy a zdokumentovať migráciu dát. Pilot nie je produkčná implementácia.
