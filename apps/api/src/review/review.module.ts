import { Module } from '@nestjs/common';
import { ReviewController, UserReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  controllers: [ReviewController, UserReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}