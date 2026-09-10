const SAFE_HREF = /^(https?:\/\/|mailto:|\/)[^\s"'<>]*$/i

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function inline(value: string): string {
  let text = escapeHtml(value)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_all, label: string, href: string) => {
    const target = String(href || "").trim()
    if (!SAFE_HREF.test(target)) return label
    return `<a href="${escapeHtml(target)}">${label}</a>`
  })
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>")
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>")
  return text
}

export function renderLegalMarkdown(source: string): string {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n")
  const html: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length + 1
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i += 1
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ""))}</li>`)
        i += 1
      }
      html.push(`<ul>${items.join("")}</ul>`)
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ""))}</li>`)
        i += 1
      }
      html.push(`<ol>${items.join("")}</ol>`)
      continue
    }
    const chunk = [line]
    i += 1
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s+|[-*]\s+|\d+\.\s+)/.test(lines[i])
    ) {
      chunk.push(lines[i])
      i += 1
    }
    html.push(`<p>${chunk.map(inline).join("<br>")}</p>`)
  }
  return html.join("")
}
