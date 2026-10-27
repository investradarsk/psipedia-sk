/** Optional branded PNG generated in the editor; the original article image is untouched. */
export async function createFacebookArticleGraphic(src: string, title: string): Promise<File> {
  const url = new URL(src, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error("Fotografia musí byť uložená na Psipedia.sk.");
  const response = await fetch(url.toString(), { credentials: "same-origin" });
  if (!response.ok) throw new Error("Obrázok sa nedá načítať.");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Prehliadač nepodporuje tvorbu grafiky.");
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale, height = bitmap.height * scale;
    ctx.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const shade = ctx.createLinearGradient(0, 260, 0, 800);
    shade.addColorStop(0, "rgba(3, 36, 28, 0)");
    shade.addColorStop(1, "rgba(3, 36, 28, 0.94)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 1280, 800);
    ctx.fillStyle = "#d1f3cb";
    ctx.font = "bold 30px system-ui";
    ctx.fillText("PSIPEDIA.SK", 70, 475);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 64px system-ui";
    const lines: string[] = [];
    let line = "";
    for (const word of title.trim().split(/\s+/)) {
      if (ctx.measureText((line + " " + word).trim()).width > 1120 && line) {
        lines.push(line);
        line = word;
      } else line = (line + " " + word).trim();
    }
    if (line) lines.push(line);
    const visible = lines.slice(0, 3);
    if (lines.length > 3) visible[2] = visible[2].slice(0, 32) + "…";
    const start = 750 - 82 * (visible.length - 1);
    visible.forEach((text, index) => ctx.fillText(text, 70, start + index * 82, 1120));
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("PNG sa nepodarilo vytvoriť.")), "image/png"));
    if (blob.size > 8 * 1024 * 1024) throw new Error("Grafika je väčšia ako 8 MB.");
    return new File([blob], "psipedia-facebook-clanok.png", { type: "image/png" });
  } finally { bitmap.close(); }
}
