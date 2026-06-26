import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { CopyrightOwnerType, RegistrationType } from '@prisma/client';

/**
 * Creator 填著作权人信息 + 备案类型/地区.
 * - INDIVIDUAL 必须填 ownerIdNumber (身份证号)
 * - COMPANY 可选 (营业执照号)
 * - PROVINCIAL 必须填 region
 * - NATIONAL region 留空
 */
export class DraftRegistrationDto {
  @IsString()
  @Length(2, 100, { message: '著作权人姓名长度 2-100' })
  ownerName!: string;

  @IsEnum(CopyrightOwnerType, { message: 'ownerType 必须是 COMPANY 或 INDIVIDUAL' })
  ownerType!: CopyrightOwnerType;

  @ValidateIf((o) => o.ownerType === 'INDIVIDUAL')
  @IsString()
  @Matches(/^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/, {
    message: '身份证号格式不正确',
  })
  ownerIdNumber?: string;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  ownerIdNumberCompany?: string;

  @IsEnum(RegistrationType, { message: 'registrationType 必须是 NATIONAL 或 PROVINCIAL' })
  registrationType!: RegistrationType;

  @ValidateIf((o) => o.registrationType === 'PROVINCIAL')
  @IsString()
  @Length(2, 30, { message: '省份名称长度 2-30' })
  registrationRegion?: string;
}