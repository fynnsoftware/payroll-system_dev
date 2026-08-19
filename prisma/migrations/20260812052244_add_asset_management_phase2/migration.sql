-- CreateTable
CREATE TABLE "DepreciationCalcType" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "DepreciationCalcType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationCalcType_code_key" ON "DepreciationCalcType"("code");
