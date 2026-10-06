import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'supersecret_tucondominio360_jwt_dev_key_2026'),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const res = await this.db.query(
      `SELECT id, email, first_name, last_name, doc_type, doc_number, phone, is_active, is_superadmin
       FROM users WHERE id = $1 AND is_active = TRUE`,
      [payload.sub],
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Token inválido o usuario inactivo');
    }

    return res.rows[0];
  }
}
