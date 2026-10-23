export function budgetSummaryColumns(columns: { id: string }[]) {
    const description = columns.findIndex(({ id }) => id === 'description');
    let start = description;
    // Preserve amount columns when the user has reordered them before the description.
    while (
        start > 0 &&
        !['allocated', 'actual', 'variance'].includes(columns[start - 1].id)
    ) {
        start--;
    }
    return columns.flatMap((column, index) => {
        if (index < start || index > description) {
            return [{ id: column.id, colSpan: 1 }];
        }
        return index === start
            ? [{ id: 'description', colSpan: description - start + 1 }]
            : [];
    });
}
