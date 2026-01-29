import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import {
  CreatePaymentDto,
  RefundPaymentDto,
  PaymentResponseDto,
  RefundResponseDto,
  TransactionDto,
} from './dto/payment.dto';

/**
 * Payment Controller
 * 
 * REST API endpoints for payment operations.
 * This controller is provider-agnostic - it works with any payment provider.
 */
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Create a new payment
   * 
   * POST /payments
   */
  @Post()
  async createPayment(@Body() dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    return this.paymentService.createPayment(dto);
  }

  /**
   * Get payment by transaction ID
   * 
   * GET /payments/:id
   */
  @Get(':id')
  async getPayment(@Param('id') id: string): Promise<TransactionDto> {
    const transaction = await this.paymentService.getPayment(id);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  /**
   * Get payment by your reference ID (order ID, invoice ID, etc.)
   * 
   * GET /payments/reference/:referenceId
   */
  @Get('reference/:referenceId')
  async getPaymentByReference(@Param('referenceId') referenceId: string): Promise<TransactionDto> {
    const transaction = await this.paymentService.getPaymentByReference(referenceId);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  /**
   * Sync payment status with provider
   * 
   * POST /payments/:id/sync
   */
  @Post(':id/sync')
  async syncPaymentStatus(@Param('id') id: string): Promise<PaymentResponseDto> {
    return this.paymentService.syncPaymentStatus(id);
  }

  /**
   * Cancel a pending payment
   * 
   * POST /payments/:id/cancel
   */
  @Post(':id/cancel')
  async cancelPayment(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.cancelPayment(id, reason);
  }

  /**
   * Refund a payment (full or partial)
   * 
   * POST /payments/refund
   */
  @Post('refund')
  async refundPayment(@Body() dto: RefundPaymentDto): Promise<RefundResponseDto> {
    return this.paymentService.refundPayment(dto);
  }

  /**
   * Webhook endpoint for payment provider callbacks
   * 
   * POST /payments/webhook
   * 
   * Note: This endpoint receives raw body for signature verification
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') stripeSignature?: string,
    @Headers('paypal-transmission-sig') paypalSignature?: string,
    @Headers('x-airwallex-signature') airwallexSignature?: string,
  ): Promise<{ received: boolean }> {
    const signature = stripeSignature || paypalSignature || airwallexSignature || '';
    const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));

    await this.paymentService.handleWebhook(payload, signature);

    return { received: true };
  }
}
