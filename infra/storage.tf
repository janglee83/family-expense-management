# Random string for unique bucket names
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# Frontend Static Hosting Bucket
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-frontend-${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Receipts Storage Bucket (for backend uploads)
resource "aws_s3_bucket" "receipts" {
  bucket = "${var.project_name}-receipts-${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket_cors_configuration" "receipts" {
  bucket = aws_s3_bucket.receipts.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = ["*"] # Should be restricted in production
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
