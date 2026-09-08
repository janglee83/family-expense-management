variable "aws_region" {
  description = "AWS Region to deploy to"
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "Name of the project used for tagging and naming"
  default     = "family-expense"
}

variable "instance_type" {
  description = "EC2 instance type (ARM based recommended)"
  default     = "t4g.small"
}

variable "domain_name" {
  description = "The domain name for the application (e.g. example.com). Leave empty if not using a domain yet."
  type        = string
  default     = ""
}
