'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
  Eye,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  searchField?: (item: T) => string;
  externalSearchQuery?: string;
  filterOptions?: {
    label: string;
    key: string;
    options: { label: string; value: string }[];
    predicate: (item: T, value: string) => boolean;
  }[];
  onView?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  emptyMessage?: string;
  pageSize?: number;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  searchField,
  externalSearchQuery = '',
  filterOptions,
  onView,
  onEdit,
  onDelete,
  emptyMessage = 'No records found matching your filters',
  pageSize = 10,
}: DataTableProps<T>) {
  const [internalSearch, setInternalSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const query = (externalSearchQuery || internalSearch).toLowerCase().trim();

  // Filtered & Sorted Data
  const processedData = useMemo(() => {
    let result = [...data];

    // Search query
    if (query && searchField) {
      result = result.filter((item) => searchField(item).toLowerCase().includes(query));
    }

    // Facet Filters
    if (filterOptions) {
      for (const filter of filterOptions) {
        const val = selectedFilters[filter.key];
        if (val && val !== 'all') {
          result = result.filter((item) => filter.predicate(item, val));
        }
      }
    }

    // Sorting
    if (sortKey) {
      result.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[sortKey];
        const bVal = (b as Record<string, unknown>)[sortKey];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortAsc ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal ?? '').toLowerCase();
        const bStr = String(bVal ?? '').toLowerCase();
        return sortAsc ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }

    return result;
  }, [data, query, searchField, filterOptions, selectedFilters, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = processedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Controls Bar */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {filterOptions && filterOptions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={14} color="var(--text-muted)" />
              {filterOptions.map((f) => (
                <select
                  key={f.key}
                  value={selectedFilters[f.key] || 'all'}
                  onChange={(e) => {
                    setSelectedFilters((prev) => ({ ...prev, [f.key]: e.target.value }));
                    setPage(1);
                  }}
                  className="select-input"
                  style={{ width: 'auto', padding: '5px 10px', fontSize: '12px', height: '32px' }}
                >
                  <option value="all">All {f.label}</option>
                  {f.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          )}

          {Object.values(selectedFilters).some((v) => v !== 'all') && (
            <button
              onClick={() => setSelectedFilters({})}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '11px', color: 'var(--accent-rose)' }}
            >
              Reset Filters
            </button>
          )}
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Showing <strong style={{ color: '#FFF' }}>{processedData.length}</strong> records
        </div>
      </div>

      {/* Table Content */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-subtle)' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: col.sortable ? 'pointer' : 'default',
                    textAlign: col.align || 'left',
                    width: col.width,
                    userSelect: 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
                    }}
                  >
                    <span>{col.header}</span>
                    {col.sortable && <ArrowUpDown size={12} />}
                  </div>
                </th>
              ))}
              {(onView || onEdit || onDelete) && (
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (onView || onEdit || onDelete ? 1 : 0)}
                  style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{emptyMessage}</div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>Try adjusting your filters or search keywords</div>
                </td>
              </tr>
            ) : (
              pageItems.map((item) => {
                const rowKey = keyExtractor(item);
                return (
                  <tr
                    key={rowKey}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 0.15s ease',
                    }}
                    className="table-row"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        style={{
                          padding: '12px 16px',
                          color: 'var(--text-primary)',
                          textAlign: col.align || 'left',
                          verticalAlign: 'middle',
                        }}
                      >
                        {col.render
                          ? col.render(item)
                          : String((item as Record<string, unknown>)[col.key] ?? '—')}
                      </td>
                    ))}

                    {(onView || onEdit || onDelete) && (
                      <td style={{ padding: '12px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          {onView && (
                            <button
                              onClick={() => onView(item)}
                              className="btn btn-ghost btn-sm"
                              title="View dossier details"
                              style={{ padding: '5px' }}
                            >
                              <Eye size={15} />
                            </button>
                          )}
                          {onEdit && (
                            <button
                              onClick={() => onEdit(item)}
                              className="btn btn-ghost btn-sm"
                              title="Edit item"
                              style={{ padding: '5px' }}
                            >
                              <Edit2 size={15} />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(item)}
                              className="btn btn-ghost btn-sm"
                              title="Delete or exclude record"
                              style={{ padding: '5px', color: 'var(--accent-rose)' }}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div
        style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        <span>
          Page <strong style={{ color: '#FFF' }}>{currentPage}</strong> of{' '}
          <strong style={{ color: '#FFF' }}>{totalPages}</strong>
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="btn btn-secondary btn-sm"
            style={{ opacity: currentPage <= 1 ? 0.4 : 1 }}
          >
            <ChevronLeft size={14} />
            <span>Prev</span>
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="btn btn-secondary btn-sm"
            style={{ opacity: currentPage >= totalPages ? 0.4 : 1 }}
          >
            <span>Next</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
