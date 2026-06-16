import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateLeadParams {
  name: string;
  company?: string;
  phone?: string;
  wechat?: string;
  email?: string;
  message: string;
  source?: string;
}

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  create(params: CreateLeadParams) {
    return this.prisma.contactLead.create({
      data: {
        name: params.name,
        company: params.company || null,
        phone: params.phone || null,
        wechat: params.wechat || null,
        email: params.email || null,
        message: params.message,
        source: params.source || null,
        status: 'NEW',
      },
    });
  }

  list(status?: string) {
    return this.prisma.contactLead.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  update(id: string, data: { status?: 'NEW' | 'CONTACTED' | 'CLOSED'; notes?: string }) {
    return this.prisma.contactLead.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
  }
}