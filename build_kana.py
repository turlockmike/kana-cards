#!/usr/bin/env python3
"""Build kana.json: romaji -> {kana, romaji, type, order, strokes[]} from KanjiVG.
KanjiVG data is CC BY-SA 3.0 (Ulrich Apel / kanjivg.tagaini.net) — attributed in the app."""
import json, re, sys, urllib.request, time

# Hiragana in gojuon learning order: (romaji, char). Katakana derived by +0x60.
HIRA = [
    ("a","あ"),("i","い"),("u","う"),("e","え"),("o","お"),
    ("ka","か"),("ki","き"),("ku","く"),("ke","け"),("ko","こ"),
    ("sa","さ"),("shi","し"),("su","す"),("se","せ"),("so","そ"),
    ("ta","た"),("chi","ち"),("tsu","つ"),("te","て"),("to","と"),
    ("na","な"),("ni","に"),("nu","ぬ"),("ne","ね"),("no","の"),
    ("ha","は"),("hi","ひ"),("fu","ふ"),("he","へ"),("ho","ほ"),
    ("ma","ま"),("mi","み"),("mu","む"),("me","め"),("mo","も"),
    ("ya","や"),("yu","ゆ"),("yo","よ"),
    ("ra","ら"),("ri","り"),("ru","る"),("re","れ"),("ro","ろ"),
    ("wa","わ"),("wo","を"),("n","ん"),
    # dakuten
    ("ga","が"),("gi","ぎ"),("gu","ぐ"),("ge","げ"),("go","ご"),
    ("za","ざ"),("ji","じ"),("zu","ず"),("ze","ぜ"),("zo","ぞ"),
    ("da","だ"),("di","ぢ"),("du","づ"),("de","で"),("do","ど"),
    ("ba","ば"),("bi","び"),("bu","ぶ"),("be","べ"),("bo","ぼ"),
    # handakuten
    ("pa","ぱ"),("pi","ぴ"),("pu","ぷ"),("pe","ぺ"),("po","ぽ"),
]

def fetch_strokes(char):
    cp = ord(char)
    fn = f"{cp:05x}.svg"
    url = f"https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{fn}"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                svg = r.read().decode("utf-8")
            break
        except Exception as e:
            if attempt == 2:
                return None, f"fetch-fail {fn}: {e}"
            time.sleep(1)
    # extract d="" in document order for path ids matching -s<number>
    paths = re.findall(r'id="kvg:[0-9a-f]+-s\d+"[^>]*\bd="([^"]+)"', svg)
    if not paths:
        return None, f"no-paths {fn}"
    return paths, None

def main():
    out = {}
    errs = []
    total = len(HIRA) * 2
    done = 0
    for order, (romaji, hira) in enumerate(HIRA):
        kata = chr(ord(hira) + 0x60)
        for typ, ch in (("hiragana", hira), ("katakana", kata)):
            key = f"{typ[:1]}_{romaji}"  # e.g. h_a, k_a
            strokes, err = fetch_strokes(ch)
            done += 1
            if err:
                errs.append(err)
                sys.stderr.write(f"[{done}/{total}] ERR {ch} {err}\n")
                continue
            out[key] = {"kana": ch, "romaji": romaji, "type": typ,
                        "order": order, "strokes": strokes}
            sys.stderr.write(f"[{done}/{total}] ok {ch} {romaji} ({len(strokes)} strokes)\n")
    with open("kana.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    sys.stderr.write(f"\nWROTE kana.json: {len(out)} chars, {len(errs)} errors\n")
    if errs:
        sys.stderr.write("ERRORS:\n" + "\n".join(errs) + "\n")

if __name__ == "__main__":
    main()
