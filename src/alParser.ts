import { AlField, AlKey, AlTable } from "./types";

export function parseAlFile(content: string, filePath: string, objectNamePrefix?: string): AlTable[] {
    const tables: AlTable[] = [];

    const normalizeName = buildPrefixStripper(objectNamePrefix);

    const objectRegex =
        /\b(table|tableextension)\s+(\d+)\s+(?:"([^"]+)"|([A-Za-z_][\w]*))\s*(?:extends\s+(?:"([^"]+)"|([A-Za-z_][\w]*)))?\s*\{/gi;

    let match: RegExpExecArray | null;
    while ((match = objectRegex.exec(content)) !== null) {
        const objectType = match[1].toLowerCase() as "table" | "tableextension";
        const id = parseInt(match[2], 10);
        const name = normalizeName(match[3] ?? match[4] ?? "");
        const extendsTable = normalizeName(match[5] ?? match[6] ?? "");

        const bodyStart = match.index + match[0].length;
        const body = extractBalancedBlock(content, bodyStart);

        const caption = normalizeName(extractTableCaption(body));
        const fields = parseFields(body, normalizeName, objectNamePrefix);
        const keys = parseKeys(body, normalizeName);

        const pkKey = keys.find((k) => k.isPrimaryKey);
        if (pkKey) {
            for (const f of fields) {
                if (pkKey.fields.some((kf) => kf.toLowerCase() === f.name.toLowerCase())) {
                    f.isPrimaryKey = true;
                }
            }
        }

        for (const f of fields) {
            if (f.tableRelation) {
                f.isForeignKey = true;
                const resolved = resolveTableRelation(f.tableRelation, normalizeName);
                f.relatedTable = resolved.table;
                f.relatedField = resolved.field;
            }
        }

        tables.push({
            id,
            name,
            caption,
            objectType,
            extendsTable,
            fields,
            keys,
            filePath,
        });
    }

    return tables;
}

function extractTableCaption(body: string): string {
    const fieldsStart = body.search(/\bfields\s*\{/i);
    const topLevel = fieldsStart > 0 ? body.substring(0, fieldsStart) : body.substring(0, 500);

    const captionMatch = /\bCaption\s*=\s*'((?:[^']|'')*)'/i.exec(topLevel);
    if (captionMatch) {
        return captionMatch[1].replace(/''/g, "'");
    }

    return "";
}

function parseFields(body: string, normalizeName: (value: string) => string, objectNamePrefix?: string): AlField[] {
    const fields: AlField[] = [];

    const fieldsBlockMatch = /\bfields\s*\{/i.exec(body);
    if (!fieldsBlockMatch) {
        return fields;
    }

    const fieldsBody = extractBalancedBlock(body, fieldsBlockMatch.index + fieldsBlockMatch[0].length);

    const fieldRegex = /\bfield\s*\(\s*(\d+)\s*;\s*(?:"([^"]+)"|([^;]+))\s*;\s*([^)]+)\)/gi;
    let fm: RegExpExecArray | null;

    while ((fm = fieldRegex.exec(fieldsBody)) !== null) {
        const fieldId = parseInt(fm[1], 10);
        const fieldName = normalizeName((fm[2] ?? fm[3] ?? "").trim());
        const fieldType = fm[4].trim();

        const afterField = fieldsBody.substring(fm.index + fm[0].length);
        const fieldBody = extractFieldBody(afterField);

        const caption = normalizeName(extractProperty(fieldBody, "Caption"));
        const fieldClass = extractProperty(fieldBody, "FieldClass") || "Normal";
        const tableRelation = extractTableRelation(fieldBody, objectNamePrefix);

        if (fieldClass.toLowerCase() === "flowfield" || fieldClass.toLowerCase() === "flowfilter") {
            continue;
        }

        fields.push({
            id: fieldId,
            name: fieldName,
            type: fieldType,
            caption,
            fieldClass,
            tableRelation,
            isPrimaryKey: false,
            isForeignKey: false,
            relatedTable: "",
            relatedField: "",
        });
    }

    return fields;
}

function extractFieldBody(afterField: string): string {
    const trimmed = afterField.trimStart();
    if (!trimmed.startsWith("{")) {
        return "";
    }
    return extractBalancedBlock(trimmed, 1);
}

function parseKeys(body: string, normalizeName: (value: string) => string): AlKey[] {
    const keys: AlKey[] = [];

    const keysBlockMatch = /\bkeys\s*\{/i.exec(body);
    if (!keysBlockMatch) {
        return keys;
    }

    const keysBody = extractBalancedBlock(body, keysBlockMatch.index + keysBlockMatch[0].length);

    const keyRegex = /\bkey\s*\(\s*(?:"([^"]+)"|([^;]+))\s*;\s*([^)]+)\)/gi;
    let km: RegExpExecArray | null;
    let isFirst = true;

    while ((km = keyRegex.exec(keysBody)) !== null) {
        const keyName = normalizeName((km[1] ?? km[2] ?? "").trim().replace(/^"|"$/g, ""));
        const keyFields = parseKeyFields(km[3]).map(normalizeName);

        keys.push({
            name: keyName,
            fields: keyFields,
            isPrimaryKey: isFirst,
        });
        isFirst = false;
    }

    return keys;
}

function parseKeyFields(raw: string): string[] {
    const fields: string[] = [];
    const regex = /"([^"]+)"|([^,]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
        const value = (match[1] ?? match[2] ?? "").trim();
        if (value) {
            fields.push(value);
        }
    }
    return fields;
}

function extractProperty(fieldBody: string, propertyName: string): string {
    const regex = new RegExp(`\\b${propertyName}\\s*=\\s*'((?:[^']|'')*)'`, "i");
    const match = regex.exec(fieldBody);
    if (match) {
        return match[1].replace(/''/g, "'");
    }

    const regex2 = new RegExp(`\\b${propertyName}\\s*=\\s*([^;]+);`, "i");
    const match2 = regex2.exec(fieldBody);
    if (match2) {
        return match2[1].trim();
    }

    return "";
}

function extractTableRelation(fieldBody: string, objectNamePrefix?: string): string {
    const regex = /\bTableRelation\s*=\s*([\s\S]*?);/i;
    const match = regex.exec(fieldBody);
    if (match) {
        const normalized = match[1].replace(/\s+/g, " ").trim();
        if (!objectNamePrefix) {
            return normalized;
        }
        const strip = buildPrefixStripper(objectNamePrefix);
        return normalized.replace(/"([^"]+)"/g, (_, name) => `"${strip(name)}"`);
    }
    return "";
}

function resolveTableRelation(raw: string, normalizeName: (value: string) => string): { table: string; field: string } {
    if (!raw) {
        return { table: "", field: "" };
    }

    let cleaned = raw.replace(/\b(WHERE|IF)\b[\s\S]*/i, "").trim();

    const tableMatch = /^"([^"]+)"/.exec(cleaned);
    if (!tableMatch) {
        const unquoted = /^(\w+)/.exec(cleaned);
        return { table: normalizeName(unquoted ? unquoted[1] : raw), field: "" };
    }

    const table = normalizeName(tableMatch[1]);
    cleaned = cleaned.substring(tableMatch[0].length).trim();

    let field = "";
    if (cleaned.startsWith(".")) {
        cleaned = cleaned.substring(1);
        const fieldMatch = /^"([^"]+)"/.exec(cleaned);
        if (fieldMatch) {
            field = normalizeName(fieldMatch[1]);
        } else {
            const uf = /^(\w+)/.exec(cleaned);
            if (uf) {
                field = normalizeName(uf[1]);
            }
        }
    }

    return { table, field };
}

function buildPrefixStripper(prefix?: string): (value: string) => string {
    if (!prefix) {
        return (value: string) => value;
    }

    return (value: string) => {
        if (!value) {
            return value;
        }
        return value.startsWith(prefix) ? value.substring(prefix.length) : value;
    };
}

function extractBalancedBlock(content: string, startAfterBrace: number): string {
    let depth = 1;
    let i = startAfterBrace;
    let inString = false;
    let stringChar = "";

    while (i < content.length && depth > 0) {
        const ch = content[i];

        if (inString) {
            if (ch === stringChar) {
                inString = false;
            }
        } else {
            if (ch === "'" || ch === '"') {
                inString = true;
                stringChar = ch;
            } else if (ch === "{") {
                depth++;
            } else if (ch === "}") {
                depth--;
            } else if (ch === "/" && i + 1 < content.length && content[i + 1] === "/") {
                const eol = content.indexOf("\n", i);
                i = eol === -1 ? content.length : eol;
            }
        }

        if (depth > 0) {
            i++;
        }
    }

    return content.substring(startAfterBrace, i);
}
