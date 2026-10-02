import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useTranslation } from '../../../lib/use-translation';

export interface TableDataFieldProps {
  /** Checked, not assumed: a table saved before it had rows holds no key at all. */
  value: unknown;
  onChange: (value: string[][]) => void;
}

/** Rows of text cells, the first row the header — what a table stores. */
function isTableData(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
    )
  );
}

/** Every cell is an always-visible <input>, no collapsed row to discover. The first row is always the header (content-model.ts's own comment). */
export function TableDataField({
  value: stored,
  onChange,
}: TableDataFieldProps) {
  const { t } = useTranslation();
  // Anything that is not a table starts as one empty header cell, which is
  // what the first edit builds on.
  const value = isTableData(stored) ? stored : [['']];
  const columnCount = value[0]?.length ?? 0;

  function handleCellChange(rowIndex: number, colIndex: number, cell: string) {
    onChange(
      value.map((row, r) =>
        r === rowIndex
          ? row.map((old, c) => (c === colIndex ? cell : old))
          : row,
      ),
    );
  }

  function handleAddRow() {
    onChange([...value, new Array<string>(columnCount).fill('')]);
  }

  function handleRemoveRow(rowIndex: number) {
    onChange(value.filter((_, i) => i !== rowIndex));
  }

  function handleAddColumn() {
    onChange(value.map((row) => [...row, '']));
  }

  function handleRemoveColumn() {
    onChange(value.map((row) => row.slice(0, -1)));
  }

  return (
    <div className="flex flex-col gap-2">
      {value.map((row, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-1.5">
          {row.map((cell, colIndex) => (
            <Input
              key={colIndex}
              type="text"
              // Named by position: a grid of bare inputs said "edit text"
              // forty times, with nothing about which cell had focus.
              aria-label={
                rowIndex === 0
                  ? t('canvas.tableData.headerCell', { column: colIndex + 1 })
                  : t('canvas.tableData.cell', {
                      row: rowIndex,
                      column: colIndex + 1,
                    })
              }
              placeholder={
                rowIndex === 0
                  ? t('canvas.tableData.columnPlaceholder', {
                      column: colIndex + 1,
                    })
                  : undefined
              }
              value={cell}
              onChange={(event) =>
                handleCellChange(rowIndex, colIndex, event.target.value)
              }
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleRemoveRow(rowIndex)}
            disabled={value.length <= 1}
            aria-label={
              rowIndex === 0
                ? t('canvas.tableData.removeHeaderRowLabel')
                : t('canvas.tableData.removeRowLabel', { row: rowIndex })
            }
          >
            {t('canvas.tableData.removeRow')}
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRow}
        >
          {t('canvas.tableData.addRow')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddColumn}
        >
          {t('canvas.tableData.addColumn')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRemoveColumn}
          disabled={columnCount <= 1}
        >
          {t('canvas.tableData.removeLastColumn')}
        </Button>
      </div>
    </div>
  );
}
