# نشر Educon POS بطريقة إنتاجية

## المسار المعتمد
- الباكند: خدمة FastAPI مستقلة مع PostgreSQL مُدار.
- الواجهة: بناء Vite ثابت يُخدم عبر Nginx أو Static Hosting.
- الترحيلات: تُنفذ قبل تشغيل النسخة الجديدة عبر `python -m scripts.run_migrations`.
- الفحص الصحي: يعتمد على `/health/live` و `/health/ready`.

## Railway
- الباكند:
  - Root Directory: `/`
  - Build Command: `pip install -r requirements.txt`
  - Pre-Deploy Command: `python -m scripts.run_migrations`
  - Start Command: `python -m scripts.start_backend`
- الواجهة:
  - Root Directory: `pos-frontend`
  - Build Command: `npm ci && npm run build`
  - Start Command: `npx serve -s dist -l $PORT`

## المتغيرات المطلوبة للإنتاج
- `APP_ENV=production`
- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `CORS_ALLOWED_ORIGINS`
- `TRUSTED_HOSTS`
- `VITE_API_BASE_URL`

## خطوات النشر
1. شغّل خط CI/CD وتأكد من نجاح الاختبارات والبناء.
2. نفّذ الترحيلات مرة واحدة قبل استلام الترافيك.
3. انشر الباكند وانتظر نجاح `/health/ready`.
4. انشر الواجهة بعد تثبيت رابط الباكند النهائي.
5. اختبر تسجيل الدخول، البيع، الحجوزات، والمزامنة الأوفلاين.

## الأمان والتشغيل
- لا تستخدم أي سر داخل المستودع.
- فعّل HTTPS فقط عبر المنصة أو الـ reverse proxy.
- احصر `/metrics` على شبكة المراقبة فقط.
- استخدم النسخ الاحتياطية المجدولة واختبر الاستعادة دوريًا.

## مراجع التشغيل
- [DEPLOYMENT.md](file:///e:/شغل/شغل/project/DEPLOYMENT.md)
- [ROLLBACK.md](file:///e:/شغل/شغل/project/ROLLBACK.md)
- [RECOVERY.md](file:///e:/شغل/شغل/project/RECOVERY.md)
- [OPERATIONS_CHECKLIST.md](file:///e:/شغل/شغل/project/OPERATIONS_CHECKLIST.md)
