import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, RefundPaymentDto } from './dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Create a new payment
   * POST /payments
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPayment(@Body() dto: CreatePaymentDto) {
    const payment = await this.paymentsService.createPayment(dto);
    return {
      success: true,
      data: payment,
    };
  }

  /**
   * Get all payments
   * GET /payments
   */
  @Get()
  async getPayments() {
    const payments = await this.paymentsService.getPayments();
    return {
      success: true,
      data: payments,
    };
  }

  /**
   * Get payment by ID
   * GET /payments/:id
   */
  @Get(':id')
  async getPayment(@Param('id') id: string) {
    const payment = await this.paymentsService.getPayment(id);
    return {
      success: true,
      data: payment,
    };
  }

  /**
   * Refund a payment
   * POST /payments/:id/refund
   */
  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  async refundPayment(@Param('id') id: string, @Body() dto: RefundPaymentDto) {
    const payment = await this.paymentsService.refundPayment(id, dto);
    return {
      success: true,
      data: payment,
    };
  }

  /**
   * Cancel a payment
   * POST /payments/:id/cancel
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelPayment(@Param('id') id: string) {
    const payment = await this.paymentsService.cancelPayment(id);
    return {
      success: true,
      data: payment,
    };
  }

  /**
   * Sync payment status with provider
   * POST /payments/:id/sync
   */
  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  async syncPayment(@Param('id') id: string) {
    const payment = await this.paymentsService.syncPaymentStatus(id);
    return {
      success: true,
      data: payment,
    };
  }

  /**
   * Get current provider info
   * GET /payments/provider/info
   */
  @Get('provider/info')
  async getProviderInfo() {
    const providerName = this.paymentsService.getProviderName();
    const isConnected = await this.paymentsService.verifyProviderConnection();
    return {
      success: true,
      data: {
        provider: providerName,
        connected: isConnected,
      },
    };
  }
}
