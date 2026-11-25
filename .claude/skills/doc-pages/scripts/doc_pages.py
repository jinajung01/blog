"""Markdown 문서를 A4·브라우저 기본 글자 크기(16px) PDF로 만들어 쪽수와 남은 여유를 확인한다.

사용법:
    python doc_pages.py docs/PRD.md [docs/TEST_REPORT.md ...] [--limit 3] [--keep-pdf DIR]

출력 (문서마다):
    - 쪽수, 기준(--limit) 통과 여부
    - 여유: 마지막 쪽에 한 줄짜리 문단을 몇 개 더 넣을 수 있는지 (0이면 한 줄만 늘어도 넘침)
    - (pypdf가 있으면) 쪽마다 첫 줄·마지막 줄, 넘친 쪽의 내용

Chrome(또는 Edge)의 헤드리스 PDF 인쇄를 쓴다. 이미지 상대 경로가 깨지지 않도록 문서 폴더를 기준으로 연다.
"""
import argparse, html, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome", "chromium", "chromium-browser",
]


def find_browser():
    for b in BROWSERS:
        if os.path.isfile(b) or shutil.which(b):
            return b
    sys.exit("Chrome이나 Edge를 찾지 못했어요. 설치 경로를 BROWSERS 목록에 추가해 주세요.")


def inline(t):
    t = html.escape(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"`(.+?)`", r"<code>\1</code>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", t)  # 링크는 글자만
    return t


def md_to_html(md_text, base_dir):
    """GitHub에 보이는 모양에 가깝게: 제목, 표, 목록(2단), 인용, 문단, <img> 같은 HTML 줄은 그대로."""
    lines = md_text.splitlines()
    out, i = [], 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1; continue
        if ln.lstrip().startswith("<"):
            out.append(ln); i += 1; continue
        if ln.startswith("```"):
            buf = []; i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(html.escape(lines[i])); i += 1
            i += 1
            out.append("<pre>" + "\n".join(buf) + "</pre>"); continue
        m = re.match(r"(#{1,6}) (.*)", ln)
        if m:
            n = len(m.group(1)); out.append(f"<h{n}>{inline(m.group(2))}</h{n}>"); i += 1; continue
        if re.match(r"-{3,}\s*$", ln):
            out.append("<hr>"); i += 1; continue
        if ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            t = ["<table>", "<tr>" + "".join(f"<th>{inline(c)}</th>" for c in rows[0]) + "</tr>"]
            for r in rows[2:]:
                t.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
            out.append("\n".join(t + ["</table>"])); continue
        if ln.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i].lstrip("> ").rstrip()); i += 1
            out.append(f"<blockquote><p>{inline(' '.join(buf))}</p></blockquote>"); continue
        if re.match(r"\s*([-*]|\d+\.) ", ln):
            items = []
            while i < len(lines) and (re.match(r"\s*([-*]|\d+\.) ", lines[i]) or (lines[i].startswith("  ") and lines[i].strip())):
                l = lines[i]
                if re.match(r"\s*([-*]|\d+\.) ", l):
                    items.append([len(l) - len(l.lstrip()), re.sub(r"^\s*([-*]|\d+\.) ", "", l)])
                else:
                    items[-1][1] += " " + l.strip()
                i += 1
            h, depth = [], -1
            for ind, txt in items:
                d = ind // 2
                while depth < d: h.append("<ul>"); depth += 1
                while depth > d: h.append("</ul>"); depth -= 1
                h.append(f"<li>{inline(txt)}</li>")
            h.append("</ul>" * (depth + 1))
            out.append("".join(h)); continue
        para = []
        while i < len(lines) and lines[i].strip() and not re.match(r"(#|\||>|```|<|\s*([-*]|\d+\.) )", lines[i]):
            para.append(lines[i].strip()); i += 1
        out.append(f"<p>{inline(' '.join(para))}</p>")
    base = Path(base_dir).resolve().as_uri() + "/"
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="{base}">
<style>
@page {{ size: A4; }}
table {{ border-collapse: collapse; }}
th, td {{ border: 1px solid #999; padding: 2px 6px; text-align: left; }}
img {{ max-width: 100%; }}
</style></head><body>
{chr(10).join(out)}
</body></html>"""


def print_pdf(browser, html_path, pdf_path):
    subprocess.run([browser, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={pdf_path}", Path(html_path).resolve().as_uri()],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
    data = Path(pdf_path).read_bytes()
    counts = re.findall(rb"/Count (\d+)", data)
    return max(int(c) for c in counts) if counts else 0


def page_lines(pdf_path):
    try:
        from pypdf import PdfReader
    except ImportError:
        return None
    return [p.extract_text().strip().splitlines() for p in PdfReader(str(pdf_path)).pages]


def check(md_path, browser, limit, keep_dir):
    md_path = Path(md_path)
    page_html = md_to_html(md_path.read_text(encoding="utf-8"), md_path.parent)
    tmp = Path(tempfile.mkdtemp(prefix="doc_pages_"))
    h = tmp / "doc.html"; pdf = tmp / "doc.pdf"
    h.write_text(page_html, encoding="utf-8")
    pages = print_pdf(browser, h, pdf)

    # 여유: 한 줄짜리 문단을 몇 개까지 더 넣어도 쪽수가 그대로인지
    slack = 0
    for n in range(1, 7):
        h2 = tmp / "fill.html"; p2 = tmp / "fill.pdf"
        h2.write_text(page_html.replace("</body>", "<p>여유 확인용 줄</p>" * n + "</body>"), encoding="utf-8")
        if print_pdf(browser, h2, p2) > pages:
            break
        slack = n
    slack_text = f"{slack}줄 이상" if slack == 6 else f"{slack}줄"

    ok = (limit is None) or pages <= limit
    print(f"\n[{md_path.as_posix()}] {pages}쪽" + ("" if limit is None else f" (기준 {limit}쪽 이하: {'통과' if ok else '초과'})"))
    print(f"  여유: 한 줄 문단 {slack_text} 더 들어감" + ("  ← 한 줄만 늘어도 넘침" if slack == 0 else ""))

    lines = page_lines(pdf)
    if lines is None:
        print("  (쪽별 내용을 보려면 pypdf 필요: python -m pip install pypdf)")
    else:
        for i, pl in enumerate(lines, 1):
            if not pl:
                continue
            print(f"  {i}쪽 ({len(pl)}줄) 처음: {pl[0][:50]} / 끝: {pl[-1][:50]}")
        if limit is not None and pages > limit:
            print("  넘친 내용:")
            for pl in lines[limit:]:
                for x in pl:
                    print("    " + x[:80])

    if keep_dir:
        Path(keep_dir).mkdir(parents=True, exist_ok=True)
        dest = Path(keep_dir) / (md_path.stem + ".pdf")
        shutil.copy(pdf, dest)
        print(f"  PDF: {dest.resolve()}")
    shutil.rmtree(tmp, ignore_errors=True)
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--limit", type=int, default=None, help="허용 쪽수 (예: 3)")
    ap.add_argument("--keep-pdf", default=None, help="확인용 PDF를 저장할 폴더 (저장소 밖 권장)")
    a = ap.parse_args()
    browser = find_browser()
    results = [check(f, browser, a.limit, a.keep_pdf) for f in a.files]
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
