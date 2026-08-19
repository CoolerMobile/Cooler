import { useAppTheme } from "@/components/custom/theme";
import {
  ModernTable,
  useTable,
  type Column,
  type ModernTableProps,
  type TableRow,
} from "expo-modern-table";

export type TableColumn<T extends TableRow> = Column<T>;

export type TableProps<T extends TableRow> = Omit<
  ModernTableProps<T>,
  "data" | "columns"
> & {
  data: T[];
  columns: TableColumn<T>[];
  /** number of rows shown per page when the table is first rendered */
  initialItemsPerPage?: number;
};

/**
 * app-themed, stateful wrapper around expo-modern-table
 *
 * every row needs a stable string or number `id`
 *
 * use a column's `renderCell` to render arbitrary JSX;
 * it receives the fully typed row and row index
 *
 * @example
 * const columns: TableColumn<User>[] = [
 *   { key: "name", title: "Name" },
 *   {
 *     key: "actions",
 *     title: "Actions",
 *     renderCell: (user) => <Button onPress={() => edit(user)} />,
 *   },
 * ];
 */
export const Table = <T extends TableRow>({
  data,
  columns,
  initialItemsPerPage = 10,
  theme,
  ...props
}: TableProps<T>) => {
  const { colorScheme } = useAppTheme();
  const table = useTable(data, columns, initialItemsPerPage);

  return (
    <ModernTable
      columns={columns}
      {...table.getTableProps()}
      theme={theme ?? colorScheme}
      {...props}
    />
  );
};

export type { TableRow } from "expo-modern-table";
