export type SupportStatus = "new" | "in-progress" | "resolved"

export interface SupportInquiry {
  id: string
  name: string
  email: string
  subject: string
  message: string
  status: SupportStatus
  createdAt: string
  updatedAt: string
}

export interface SupportListResponse {
  success: boolean
  module: "support"
  query: {
    page: number
    limit: number
    search: string | null
    status: SupportStatus | "all"
  }
  count: number
  totalCount: number
  inquiries: SupportInquiry[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  stats: {
    total: number
    new: number
    inProgress: number
    resolved: number
  }
  serverTime: string
}
