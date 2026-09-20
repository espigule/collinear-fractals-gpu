#!/usr/bin/env python3
"""Validate curated data against JSON Schema and cross-file mathematical metadata."""
from __future__ import annotations

import json
import math
import pathlib
import sys
from urllib.parse import parse_qs

try:
    from jsonschema import Draft202012Validator
    import yaml
except ImportError:
    raise SystemExit("Install QA dependencies: python -m pip install -r requirements-qa.txt")

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read_json(path: pathlib.Path) -> dict:
    def invalid_constant(value: str) -> None:
        raise ValueError(f"Non-finite JSON constant {value} in {path.relative_to(ROOT)}")
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=invalid_constant)


def validate_file(path: pathlib.Path, schema_name: str) -> dict:
    schema = read_json(ROOT / "schemas" / schema_name)
    Draft202012Validator.check_schema(schema)
    data = read_json(path)
    errors = sorted(Draft202012Validator(schema).iter_errors(data), key=lambda error: str(error.path))
    if errors:
        raise ValueError("\n".join(
            f"{path.relative_to(ROOT)}:{'/'.join(map(str, error.absolute_path)) or '/'}: {error.message}"
            for error in errors
        ))
    return data


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


class UniqueYamlLoader(yaml.BaseLoader):
    """GitHub uses YAML 1.2: keep 'on' a string and reject shadowed keys."""
    def construct_mapping(self, node, deep=False):
        mapping = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in mapping:
                raise ValueError(f"Duplicate YAML key {key!r} on line {key_node.start_mark.line + 1}")
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def validate_workflows() -> None:
    for path in sorted((ROOT / ".github").rglob("*.yml")):
        parsed = yaml.load(path.read_text(encoding="utf-8"), Loader=UniqueYamlLoader)
        check(isinstance(parsed, dict) or (parsed is None and path.parent.name != "workflows"),
              f"{path.relative_to(ROOT)} must be a YAML mapping")
    pages = yaml.load((ROOT / ".github/workflows/pages.yml").read_text(), Loader=UniqueYamlLoader)
    check(pages["jobs"]["validate"].get("uses") == "./.github/workflows/quality.yml",
          "Pages must invoke the shared quality workflow")
    check(pages["jobs"]["deploy"].get("needs") == "validate", "Pages must wait for validation")
    quality = yaml.load((ROOT / ".github/workflows/quality.yml").read_text(), Loader=UniqueYamlLoader)
    check("workflow_call" in quality.get("on", {}), "Quality workflow must be reusable")
    commands = [step.get("run", "") for job in quality["jobs"].values() for step in job.get("steps", [])]
    for required in ["npm test", "npm run test:browser", "npm run test:gpu", "swift test"]:
        check(required in commands, f"Shared quality gate is missing {required}")


def main() -> int:
    count = 0
    validate_workflows()
    # Validate schema definitions themselves even if no instance is published yet.
    for schema in sorted((ROOT / "schemas").glob("*.json")):
        Draft202012Validator.check_schema(read_json(schema))
    index = read_json(ROOT / "examples/examples.json")
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    check(index.get("version") == version, "Example index version does not match VERSION")
    ids: set[str] = set()
    for item in index["examples"]:
        example_id = item["id"]
        check(example_id not in ids, f"Duplicate example id: {example_id}")
        ids.add(example_id)
        for key, filename in [("config", "config.json"), ("metadata", "metadata.json")]:
            expected = f"examples/{example_id}/{filename}"
            check(item.get(key) == expected, f"{example_id}: {key} must resolve to {expected}")
        config = validate_file(ROOT / item["config"], "example-config.schema.json")
        metadata = read_json(ROOT / item["metadata"])
        check(config["N"] == 2 * config["n"] - 1, f"{example_id}: N must equal 2n - 1")
        for key in ["n", "N"]:
            check(metadata.get(key) == config[key], f"{example_id}: config/metadata {key} differ")
        if "parameter" in config:
            for key in ["re", "im"]:
                check(metadata.get("parameter", {}).get(key) == config["parameter"][key],
                      f"{example_id}: config/metadata parameter.{key} differ")
        parameter = config.get("parameter") or config["cases"][0]["parameter"]
        shared = parse_qs(item["share_hash"], keep_blank_values=True)
        for key, expected in [("n", config["n"]), ("cx", parameter["re"]), ("cy", parameter["im"]),
                              ("k", config["k_max"]), ("l", config["l_max"])]:
            values = shared.get(key, [])
            check(len(values) == 1 and math.isclose(float(values[0]), expected, rel_tol=1e-14, abs_tol=1e-14),
                  f"{example_id}: share hash {key} disagrees with config")
        count += 1

    for path in sorted((ROOT / "examples").glob("*/certificate*.json")):
        data = validate_file(path, "certificate.schema.json")
        check(data["N"] == 2 * data["n"] - 1, f"{path.name}: N must equal 2n - 1")
        check(data["software_version"] == version, f"{path.name}: software version differs")
        if "arity" in data:
            check(data["arity"] == data["n"], f"{path.name}: arity differs from n")
        if "word" in data:
            check(all(-(data["N"] - 1) <= digit <= data["N"] - 1 and digit % 2 == 0 for digit in data["word"]),
                  f"{path.name}: word has digits outside the difference alphabet")
        count += 1

    figures = validate_file(ROOT / "paper_figures/figure_metadata.json", "figure-metadata.schema.json")
    check(figures["version"] == version, "Figure metadata version differs")
    for figure in figures["figures"]:
        check((ROOT / figure["example"] / "config.json").is_file(), f"Unknown figure example: {figure['example']}")
    print(f"JSON Schema validation passed for {count} example/certificate files and figure metadata.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, OSError, yaml.YAMLError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
