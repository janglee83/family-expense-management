variable "aws_region" {
  description = "AWS Region to deploy to"
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "Name of the project used for tagging and naming"
  default     = "family-expense"
}

variable "domain_name" {
  description = "The domain name for the application (e.g. example.com). Leave empty if not using a domain yet."
  type        = string
  default     = ""
}

variable "database_url" {
  description = "Neon pooled Postgres connection string"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Upstash Redis TLS connection string (rediss://...)"
  type        = string
  sensitive   = true
}

variable "jwt_secret_key" {
  description = "JWT signing secret for the backend"
  type        = string
  sensitive   = true
}

variable "frontend_url" {
  description = "The deployed frontend's URL, used for CORS — set after the first apply once the CloudFront domain is known"
  type        = string
  default     = ""
}
