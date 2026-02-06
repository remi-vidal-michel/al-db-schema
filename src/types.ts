/**
 * Represents a field extracted from an AL table or tableextension.
 */
export interface AlField {
    id: number;
    name: string;
    type: string;
    caption: string;
    fieldClass: string; // Normal, FlowField, FlowFilter
    tableRelation: string; // raw TableRelation target (table name, possibly with field)
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    relatedTable: string; // resolved related table name (from TableRelation)
    relatedField: string; // resolved related field name (from TableRelation)
}

/**
 * Represents a key definition in an AL table.
 */
export interface AlKey {
    name: string;
    fields: string[];
    isPrimaryKey: boolean;
}

/**
 * Represents a parsed AL table (table or tableextension).
 */
export interface AlTable {
    id: number;
    name: string;
    objectType: 'table' | 'tableextension';
    extendsTable: string; // only for tableextension
    fields: AlField[];
    keys: AlKey[];
    filePath: string;
}

/**
 * Represents a foreign-key relationship between two tables.
 */
export interface AlRelation {
    fromTable: string;
    fromField: string;
    toTable: string;
    toField: string;
}

/**
 * Result of scanning an AL project.
 */
export interface AlProjectScanResult {
    tables: AlTable[];
    relations: AlRelation[];
    appJson: Record<string, unknown> | null;
    errors: string[];
}
