import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email address associated with the account', format: 'email' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  declare email: string;
}
