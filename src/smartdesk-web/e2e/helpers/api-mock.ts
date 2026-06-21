/**
 * API Mock 辅助函数
 * 支持 Mock 模式和真实 Gateway 模式
 */

import { Page, Route } from '@playwright/test'

// Mock 数据类型
interface MockTicket {
  id: string
  title: string
  description: string
  category: string
  status: 'new' | 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  requesterId: string
  requesterName: string
  assigneeId: string | null
  assigneeName: string | null
  createdAt: string
  updatedAt: string
}

interface MockComment {
  id: string
  ticketId: string
  authorId: string
  authorName: string
  authorRole: 'requester' | 'agent'
  content: string
  type: 'public' | 'internal'
  createdAt: string
}

// 内存存储 Mock 数据
class MockDataStore {
  private tickets: Map<string, MockTicket> = new Map()
  private comments: Map<string, MockComment[]> = new Map()
  private idCounter = 1

  generateId(): string {
    return `ticket-${Date.now()}-${this.idCounter++}`
  }

  createTicket(ticket: Omit<MockTicket, 'id' | 'createdAt' | 'updatedAt'>): MockTicket {
    const newTicket: MockTicket = {
      ...ticket,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.tickets.set(newTicket.id, newTicket)
    this.comments.set(newTicket.id, [])
    return newTicket
  }

  getTicket(id: string): MockTicket | undefined {
    return this.tickets.get(id)
  }

  getAllTickets(): MockTicket[] {
    return Array.from(this.tickets.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  getTicketsByRequester(requesterId: string): MockTicket[] {
    return this.getAllTickets().filter(t => t.requesterId === requesterId)
  }

  updateTicket(id: string, updates: Partial<MockTicket>): MockTicket | undefined {
    const ticket = this.tickets.get(id)
    if (!ticket) return undefined
    
    const updated = { ...ticket, ...updates, updatedAt: new Date().toISOString() }
    this.tickets.set(id, updated)
    return updated
  }

  addComment(ticketId: string, comment: Omit<MockComment, 'id' | 'createdAt'>): MockComment {
    const newComment: MockComment = {
      ...comment,
      id: `comment-${Date.now()}-${this.idCounter++}`,
      createdAt: new Date().toISOString(),
    }
    
    const ticketComments = this.comments.get(ticketId) || []
    ticketComments.push(newComment)
    this.comments.set(ticketId, ticketComments)
    
    return newComment
  }

  getComments(ticketId: string): MockComment[] {
    return this.comments.get(ticketId) || []
  }

  clear(): void {
    this.tickets.clear()
    this.comments.clear()
    this.idCounter = 1
  }
}

// 全局 Mock 数据存储
export const mockStore = new MockDataStore()

/**
 * 设置 Mock API 路由
 * @param page Playwright page 对象
 */
export async function setupMockAPI(page: Page): Promise<void> {
  // 清除之前的 Mock 数据
  mockStore.clear()

  // 拦截 Gateway API 请求
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = route.request().url()
    const method = route.request().method()
    
    // 工单创建
    if (url.includes('/tickets') && method === 'POST') {
      const body = await route.request().postDataJSON()
      const ticket = mockStore.createTicket({
        title: body.title,
        description: body.description,
        category: body.category,
        status: 'new',
        priority: body.priority || 'P2',
        requesterId: 'zhangsan',
        requesterName: '张三',
        assigneeId: null,
        assigneeName: null,
      })
      
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: ticket,
        }),
      })
      return
    }
    
    // 工单列表查询
    if (url.includes('/tickets') && method === 'GET') {
      const tickets = mockStore.getAllTickets()
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: tickets,
            total: tickets.length,
          },
        }),
      })
      return
    }
    
    // 工单详情查询
    if (url.match(/\/tickets\/[^/]+$/) && method === 'GET') {
      const ticketId = url.split('/').pop()
      const ticket = ticketId ? mockStore.getTicket(ticketId) : undefined
      
      if (ticket) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: ticket,
          }),
        })
      } else {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Ticket not found',
          }),
        })
      }
      return
    }
    
    // 评论列表查询
    if (url.match(/\/tickets\/[^/]+\/comments$/) && method === 'GET') {
      const ticketId = url.split('/')[url.split('/').length - 2]
      const comments = ticketId ? mockStore.getComments(ticketId) : []
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: comments,
        }),
      })
      return
    }
    
    // 评论创建
    if (url.match(/\/tickets\/[^/]+\/comments$/) && method === 'POST') {
      const ticketId = url.split('/')[url.split('/').length - 2]
      const body = await route.request().postDataJSON()
      
      if (ticketId) {
        const comment = mockStore.addComment(ticketId, {
          ticketId,
          authorId: body.authorId,
          authorName: body.authorName,
          authorRole: body.authorRole,
          content: body.content,
          type: body.type,
        })
        
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: comment,
          }),
        })
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Invalid ticket ID',
          }),
        })
      }
      return
    }
    
    // 其他请求继续
    await route.continue()
  })
}

/**
 * 清除 Mock API 路由
 * @param page Playwright page 对象
 */
export async function clearMockAPI(page: Page): Promise<void> {
  await page.unroute('**/api/v1/**')
  mockStore.clear()
}

/**
 * 获取 Mock 工单数据（用于测试断言）
 * @param ticketId 工单 ID
 */
export function getMockTicket(ticketId: string): MockTicket | undefined {
  return mockStore.getTicket(ticketId)
}

/**
 * 获取所有 Mock 工单
 */
export function getAllMockTickets(): MockTicket[] {
  return mockStore.getAllTickets()
}

/**
 * 预创建测试数据
 * @param requesterId 报单人 ID
 */
export function createTestTicket(requesterId: string = 'zhangsan'): MockTicket {
  return mockStore.createTicket({
    title: '无法访问黄区代码仓',
    description: '申请访问权限',
    category: 'access_request',
    status: 'new',
    priority: 'P2',
    requesterId,
    requesterName: '张三',
    assigneeId: null,
    assigneeName: null,
  })
}
