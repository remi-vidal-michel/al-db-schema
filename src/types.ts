export interface AlField {
    id: number;
    name: string;
    type: string;
    caption: string;
    fieldClass: string;
    tableRelation: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    relatedTable: string;
    relatedField: string;
}

export interface AlKey {
    name: string;
    fields: string[];
    isPrimaryKey: boolean;
}

export interface AlTable {
    id: number;
    name: string;
    caption: string;
    objectType: 'table' | 'tableextension';
    extendsTable: string;
    fields: AlField[];
    keys: AlKey[];
    filePath: string;
}

export interface AlRelation {
    fromTable: string;
    fromField: string;
    toTable: string;
    toField: string;
}

export interface AlProjectScanResult {
    tables: AlTable[];
    relations: AlRelation[];
    appJson: Record<string, unknown> | null;
    errors: string[];
}
