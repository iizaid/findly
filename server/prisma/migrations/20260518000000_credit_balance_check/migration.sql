ALTER TABLE "User" ADD CONSTRAINT "User_creditsBalance_check" CHECK ("creditsBalance" >= 0);
