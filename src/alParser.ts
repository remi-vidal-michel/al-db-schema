import { AlField, AlKey, AlTable } from './types';

/**
 * Parse a single .al file content and extract table / tableextension objects.
 * One .al file may contain multiple objects (rare but allowed).
 */
export function parseAlFile(content: string, filePath: string): AlTable[] {
    const tables: AlTable[] = [];

    // Regex to match  table <id> "<name>" or  tableextension <id> "<name>" extends "<base>"
    // AL object names can be quoted or unquoted.
    const objectRegex = /\b(table|tableextension)\s+(\d+)\s+"([^"]+)"\s*(?:extends\s+"([^"]+)")?\s*\{/gi;

    let match: RegExpExecArray | null;
    while ((match = objectRegex.exec(content)) !== null) {
        const objectType = match[1].toLowerCase() as 'table' | 'tableextension';
        const id = parseInt(match[2], 10);
        const name = match[3];
        const extendsTable = match[4] ?? '';

        // Find the body of this object (balanced braces)
        const bodyStart = match.index + match[0].length; // right after the opening {
        const body = extractBalancedBlock(content, bodyStart);

        const fields = parseFields(body);
        const keys = parseKeys(body);

        // Mark primary-key fields
        const pkKey = keys.find(k => k.isPrimaryKey);
        if (pkKey) {
            for (const f of fields) {
                if (pkKey.fields.some(kf => kf.toLowerCase() === f.name.toLowerCase())) {
                    f.isPrimaryKey = true;
                }
            }
        }

        // Resolve FK from TableRelation
        for (const f of fields) {
            if (f.tableRelation) {
                f.isForeignKey = true;
                const resolved = resolveTableRelation(f.tableRelation);
                f.relatedTable = resolved.table;
                f.relatedField = resolved.field;
            }
        }

        tables.push({
            id,
            name,
            objectType,
            extendsTable,
            fields,
            keys,
            filePath,
        });
    }

    return tables;
}

// ──────────────────────────────────────────────
//  Fields
// ──────────────────────────────────────────────

function parseFields(body: string): AlField[] {
    const fields: AlField[] = [];

    // Locate the `fields { ... }` section
    const fieldsBlockMatch = /\bfields\s*\{/i.exec(body);
    if (!fieldsBlockMatch) {
        return fields;
    }

    const fieldsBody = extractBalancedBlock(body, fieldsBlockMatch.index + fieldsBlockMatch[0].length);

    // Match individual field(...) declarations
    // field(<id>; "<Name>"; <Type>)
    const fieldRegex = /\bfield\s*\(\s*(\d+)\s*;\s*"([^"]+)"\s*;\s*([^)]+)\)/gi;
    let fm: RegExpExecArray | null;

    while ((fm = fieldRegex.exec(fieldsBody)) !== null) {
        const fieldId = parseInt(fm[1], 10);
        const fieldName = fm[2];
        const fieldType = fm[3].trim();

        // Extract the property block that follows the field declaration
        const afterField = fieldsBody.substring(fm.index + fm[0].length);
        const fieldBody = extractFieldBody(afterField);

        const caption = extractProperty(fieldBody, 'Caption');
        const fieldClass = extractProperty(fieldBody, 'FieldClass') || 'Normal';
        const tableRelation = extractTableRelation(fieldBody);

        // Skip FlowField and FlowFilter
        if (fieldClass.toLowerCase() === 'flowfield' || fieldClass.toLowerCase() === 'flowfilter') {
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
            relatedTable: '',
            relatedField: '',
        });
    }

    return fields;
}

/**
 * Extract the body (between { }) right after a field() declaration.
 * If there is no opening brace, returns empty string.
 */
function extractFieldBody(afterField: string): string {
    const trimmed = afterField.trimStart();
    if (!trimmed.startsWith('{')) {
        return '';
    }
    return extractBalancedBlock(trimmed, 1);
}

// ──────────────────────────────────────────────
//  Keys
// ──────────────────────────────────────────────

function parseKeys(body: string): AlKey[] {
    const keys: AlKey[] = [];

    // Locate the `keys { ... }` section
    const keysBlockMatch = /\bkeys\s*\{/i.exec(body);
    if (!keysBlockMatch) {
        return keys;
    }

    const keysBody = extractBalancedBlock(body, keysBlockMatch.index + keysBlockMatch[0].length);

    // key(<Name>; <Field1>, <Field2>, ...)
    const keyRegex = /\bkey\s*\(\s*([^;]+)\s*;\s*([^)]+)\)/gi;
    let km: RegExpExecArray | null;
    let isFirst = true;

    while ((km = keyRegex.exec(keysBody)) !== null) {
        const keyName = km[1].trim().replace(/^"|"$/g, '');
        const keyFields = km[2].split(',').map(f => f.trim().replace(/^"|"$/g, ''));

        keys.push({
            name: keyName,
            fields: keyFields,
            isPrimaryKey: isFirst, // first key in AL is always the PK
        });
        isFirst = false;
    }

    return keys;
}

// ──────────────────────────────────────────────
//  Property helpers
// ──────────────────────────────────────────────

function extractProperty(fieldBody: string, propertyName: string): string {
    // Match  PropertyName = 'value';  or  PropertyName = value;
    const regex = new RegExp(`\\b${propertyName}\\s*=\\s*'([^']*)'`, 'i');
    const match = regex.exec(fieldBody);
    if (match) {
        return match[1];
    }

    // Without quotes
    const regex2 = new RegExp(`\\b${propertyName}\\s*=\\s*([^;]+);`, 'i');
    const match2 = regex2.exec(fieldBody);
    if (match2) {
        return match2[1].trim();
    }

    return '';
}

function extractTableRelation(fieldBody: string): string {
    // TableRelation = "Table Name".<field> ... ;
    // Can span multiple lines; grab everything up to the final ;
    const regex = /\bTableRelation\s*=\s*([\s\S]*?);/i;
    const match = regex.exec(fieldBody);
    if (match) {
        // Normalise whitespace
        return match[1].replace(/\s+/g, ' ').trim();
    }
    return '';
}

/**
 * Given a raw TableRelation value, resolve the target table and field.
 * Examples:
 *   "Customer"                         → { table: 'Customer', field: '' }
 *   "Customer".Name                    → { table: 'Customer', field: 'Name' }
 *   "Sales Header"."No."              → { table: 'Sales Header', field: 'No.' }
 *   "Item" WHERE ("Type" = CONST(1))  → { table: 'Item', field: '' }
 *   "G/L Account" WHERE (...)         → { table: 'G/L Account', field: '' }
 */
function resolveTableRelation(raw: string): { table: string; field: string } {
    if (!raw) {
        return { table: '', field: '' };
    }

    // Remove everything from WHERE / IF onwards
    let cleaned = raw.replace(/\b(WHERE|IF)\b[\s\S]*/i, '').trim();

    // Extract table name (quoted)
    const tableMatch = /^"([^"]+)"/.exec(cleaned);
    if (!tableMatch) {
        // Unquoted table (single word)
        const unquoted = /^(\w+)/.exec(cleaned);
        return { table: unquoted ? unquoted[1] : raw, field: '' };
    }

    const table = tableMatch[1];
    cleaned = cleaned.substring(tableMatch[0].length).trim();

    // Check for .FieldName or ."FieldName"
    let field = '';
    if (cleaned.startsWith('.')) {
        cleaned = cleaned.substring(1);
        const fieldMatch = /^"([^"]+)"/.exec(cleaned);
        if (fieldMatch) {
            field = fieldMatch[1];
        } else {
            const uf = /^(\w+)/.exec(cleaned);
            if (uf) {
                field = uf[1];
            }
        }
    }

    return { table, field };
}

// ──────────────────────────────────────────────
//  Utility
// ──────────────────────────────────────────────

/**
 * Given content and a position just after an opening `{`,
 * return the inner text up to the matching closing `}`.
 */
function extractBalancedBlock(content: string, startAfterBrace: number): string {
    let depth = 1;
    let i = startAfterBrace;
    let inString = false;
    let stringChar = '';

    while (i < content.length && depth > 0) {
        const ch = content[i];

        if (inString) {
            if (ch === stringChar) {
                inString = false;
            }
        } else {
            if (ch === '\'' || ch === '"') {
                // Only treat single-quotes as string delimiters in AL property values
                // Double-quotes are used in identifiers, treat them similarly
                inString = true;
                stringChar = ch;
            } else if (ch === '{') {
                depth++;
            } else if (ch === '}') {
                depth--;
            } else if (ch === '/' && i + 1 < content.length && content[i + 1] === '/') {
                // Skip single-line comment
                const eol = content.indexOf('\n', i);
                i = eol === -1 ? content.length : eol;
            }
        }

        if (depth > 0) {
            i++;
        }
    }

    return content.substring(startAfterBrace, i);
}
