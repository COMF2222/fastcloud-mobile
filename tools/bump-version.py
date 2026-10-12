"""Prepare a mobile version and bilingual notes without publishing anything."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def bump(version, ru, en):
    if not re.fullmatch(r"(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})", version):
        raise ValueError("Use a canonical major.minor.patch version")
    package = json.loads((ROOT / "package.json").read_text())
    if tuple(map(int, version.split('.'))) <= tuple(map(int, package['version'].split('.'))):
        raise ValueError("The new version must be newer")
    if not ru or not en or any(not line.strip() for line in ru + en):
        raise ValueError("Describe the changes in both Russian and English")
    major, minor, patch = map(int, version.split('.'))
    build = major * 1_000_000 + minor * 1000 + patch
    notes_path = ROOT / 'docs/release-notes.json'
    notes = json.loads(notes_path.read_text(encoding='utf-8'))
    if any(release['version'] == version for release in notes['releases']):
        raise ValueError("Release notes already contain this version")
    package['version'] = version
    lock = json.loads((ROOT / 'package-lock.json').read_text())
    lock['version'] = lock['packages']['']['version'] = version
    project_path = ROOT / 'ios/App/App.xcodeproj/project.pbxproj'
    project = project_path.read_text()
    project = re.sub(r'MARKETING_VERSION = [^;]+;', f'MARKETING_VERSION = {version};', project)
    project = re.sub(r'CURRENT_PROJECT_VERSION = [^;]+;', f'CURRENT_PROJECT_VERSION = {build};', project)
    notes['releases'].insert(0, {'version': version,
        'ru': {'title': f'Veirune Mobile {version}', 'changes': ru},
        'en': {'title': f'Veirune Mobile {version}', 'changes': en}})
    for path, data in [(ROOT/'package.json', package), (ROOT/'package-lock.json', lock), (notes_path, notes)]:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    project_path.write_text(project)
    print(f'Prepared {version}, build {build}; nothing has been published')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('version')
    parser.add_argument('--ru', action='append', required=True)
    parser.add_argument('--en', action='append', required=True)
    args = parser.parse_args()
    bump(args.version, args.ru, args.en)
