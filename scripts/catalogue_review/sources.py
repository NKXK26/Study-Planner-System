"""Read the official BA-CS index. Downloads are confined to the ignored workspace."""
import hashlib
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from lxml import html

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "tmp/ba-cs-sources"
INDEX = "https://www.swinburne.edu.my/current-students/get-started/program-study-planner/"
MAJORS = {"CSCS": "Cybersecurity", "CSDS": "Data Science", "CSAI": "Artificial Intelligence",
          "CSIOT": "Internet of Things", "CSSD": "Software Development"}
MONTHS = {"Feb": 2, "Mar": 3, "Sep": 9}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def discover(document):
    tree = html.fromstring(document)
    rows = []
    for row in tree.xpath("//tr[normalize-space(td[1])='BA-CS']"):
        labels = [s.strip() for s in row.xpath("td[2]//em/text()")]
        section = row.xpath("preceding::h3[contains(., 'Study Planner')][1]/text()")
        for href in row.xpath("td//a/@href"):
            url = urljoin(INDEX, href)
            filename = urlsplit(url).path.split("/")[-1]
            year = re.search(r"20(24|25|26)", " ".join(section))
            if not year:
                continue
            major = next((k for k, v in MAJORS.items() if v in labels), None)
            month = next((k for k,v in {"Feb":"February","Mar":"March","Sep":"September"}.items()
                          if v+" intake" in labels), None)
            identity = f"{year[1]}-{month}-{major}"
            errors = []
            if not major or not month:
                errors.append("BA-CS index row does not identify one supported major and intake")
            if not re.fullmatch(re.escape(identity) + r"(?:r\d+)?\.pdf", filename, re.I):
                errors.append("Index labels and filename disagree")
            if urlsplit(url).netloc != "www.swinburne.edu.my" or urlsplit(url).scheme != "https":
                errors.append("Unrecognized official download host")
            rows.append(dict(name=identity, url=url, filename=filename, errors=errors,
                             indexLabels=labels, indexYear=year[0], sourceUpdate=row.xpath("normalize-space(td//h6)")))
    return rows


def download(url, path):
    result = subprocess.run(["curl", "--proto", "=https", "--fail", "--silent", "--show-error",
                             "--max-time", "90", "--retry", "2", url], capture_output=True, check=True)
    path.write_bytes(result.stdout)


def collect():
    CACHE.mkdir(parents=True, exist_ok=True)
    download(INDEX, CACHE / "index.html")
    rows = discover((CACHE / "index.html").read_bytes())
    def retrieve(row):
        if row["errors"]:
            return
        try:
            path = CACHE / row["filename"]
            download(row["url"], path)
            data = path.read_bytes()
            if not data.startswith(b"%PDF-"):
                raise ValueError("Download is not a PDF")
            row["sha256"] = digest(data)
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            row["errors"].append(str(error))
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(retrieve, rows))
    (CACHE / "sources.json").write_text(json.dumps(rows, indent=2))
    print(f"{len(rows)} index entries; {sum(bool(r.get('sha256')) for r in rows)} PDF checksums")


if __name__ == "__main__":
    collect()
