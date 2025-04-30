import { useState, useCallback } from "react";
import { UseQueryResult, UseQueryOptions } from "@tanstack/react-query";
import { PaginatedResponse, PaginationParams } from "./sw5eApi";

interface UsePaginationOptions<TData> {
  initialPage?: number;
  initialPageSize?: number;
  initialSortBy?: string;
  initialSortOrder?: "asc" | "desc";
  initialSearch?: string;
}

interface PaginationState {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
}

interface PaginationActions {
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSort: (field: string, order?: "asc" | "desc") => void;
  setSearch: (term: string) => void;
  resetFilters: () => void;
}

export type UsePaginationResult<TData> = [
  PaginationState & {
    isFirstPage: boolean;
    isLastPage: boolean;
    totalPages: number;
    total: number;
    data: TData[];
    isLoading: boolean;
    isError: boolean;
    error: any;
  },
  PaginationActions,
];

/**
 * A custom hook for handling pagination state and actions with React Query
 */
export function usePagination<TData>(
  fetchFunction: (
    params: PaginationParams,
  ) => Promise<PaginatedResponse<TData>>,
  queryKey: (params: PaginationParams) => any[],
  options: UsePaginationOptions<TData> = {},
  queryOptions: UseQueryOptions<PaginatedResponse<TData>, any> = {},
): UsePaginationResult<TData> {
  // Pagination state
  const [paginationState, setPaginationState] = useState<PaginationState>({
    page: options.initialPage || 1,
    pageSize: options.initialPageSize || 20,
    sortBy: options.initialSortBy,
    sortOrder: options.initialSortOrder,
    search: options.initialSearch,
  });

  // Use React Query for data fetching
  const {
    data: response,
    isLoading,
    isError,
    error,
  } = useQuery<PaginatedResponse<TData>, any>(
    queryKey(paginationState),
    () => fetchFunction(paginationState),
    {
      keepPreviousData: true, // Keep previous data while fetching new data
      ...queryOptions,
    },
  );

  // Pagination actions
  const nextPage = useCallback(() => {
    if (!response || paginationState.page >= response.totalPages) return;

    setPaginationState((prev) => ({
      ...prev,
      page: prev.page + 1,
    }));
  }, [paginationState.page, response]);

  const prevPage = useCallback(() => {
    if (paginationState.page <= 1) return;

    setPaginationState((prev) => ({
      ...prev,
      page: prev.page - 1,
    }));
  }, [paginationState.page]);

  const goToPage = useCallback(
    (page: number) => {
      if (page < 1 || (response && page > response.totalPages)) return;

      setPaginationState((prev) => ({
        ...prev,
        page,
      }));
    },
    [response],
  );

  const setPageSize = useCallback((pageSize: number) => {
    setPaginationState((prev) => ({
      ...prev,
      page: 1, // Reset to first page when changing page size
      pageSize,
    }));
  }, []);

  const setSort = useCallback(
    (field: string, order: "asc" | "desc" = "asc") => {
      setPaginationState((prev) => ({
        ...prev,
        page: 1, // Reset to first page when changing sort
        sortBy: field,
        sortOrder: order,
      }));
    },
    [],
  );

  const setSearch = useCallback((search: string) => {
    setPaginationState((prev) => ({
      ...prev,
      page: 1, // Reset to first page when changing search
      search,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setPaginationState({
      page: 1,
      pageSize: options.initialPageSize || 20,
      sortBy: options.initialSortBy,
      sortOrder: options.initialSortOrder,
      search: "",
    });
  }, [
    options.initialPageSize,
    options.initialSortBy,
    options.initialSortOrder,
  ]);

  // Compute derived state
  const isFirstPage = paginationState.page === 1;
  const isLastPage = !response
    ? true
    : paginationState.page >= response.totalPages;
  const totalPages = response?.totalPages || 0;
  const total = response?.total || 0;
  const data = response?.data || [];

  return [
    {
      ...paginationState,
      isFirstPage,
      isLastPage,
      totalPages,
      total,
      data,
      isLoading,
      isError,
      error,
    },
    {
      nextPage,
      prevPage,
      goToPage,
      setPageSize,
      setSort,
      setSearch,
      resetFilters,
    },
  ];
}

/**
 * Hook for infinite query pagination (load more pattern)
 */
export function useInfiniteList<TData>(
  useQueryResult: UseQueryResult<PaginatedResponse<TData>, any>,
  fetchNextPage: () => void,
  isFetchingNextPage: boolean,
) {
  const { data, isLoading, isError, error } = useQueryResult;

  const items = data?.data || [];
  const hasNextPage = data ? data.page < data.totalPages : false;

  return {
    items,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage: hasNextPage ? fetchNextPage : () => {},
  };
}
