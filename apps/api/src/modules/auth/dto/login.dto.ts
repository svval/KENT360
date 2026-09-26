import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password.service';

export class LoginDto {
  @ApiProperty({ example: 'admin@kent360.local' })
  // Pasted addresses often carry whitespace; case is normalised in AuthService.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  @MaxLength(160)
  email!: string;

  // No complexity rules at login: policy is enforced when a password is set.
  @ApiProperty({ example: 'Kent360!Demo', format: 'password' })
  @IsString()
  @MinLength(1, { message: 'Şifre gerekli.' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
