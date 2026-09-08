data "aws_ami" "ubuntu_arm" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*"]
  }
}

resource "aws_iam_role" "ec2_role" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "s3_access" {
  name        = "${var.project_name}-s3-access"
  description = "Allow EC2 to access receipts S3 bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Effect   = "Allow"
        Resource = [
          aws_s3_bucket.receipts.arn,
          "${aws_s3_bucket.receipts.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ec2_s3_attach" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = aws_iam_policy.s3_access.arn
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

resource "tls_private_key" "ssh_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "deployer" {
  key_name   = "${var.project_name}-deployer-key"
  public_key = tls_private_key.ssh_key.public_key_openssh
}

resource "aws_instance" "app_server" {
  ami           = data.aws_ami.ubuntu_arm.id
  instance_type = var.instance_type
  key_name      = aws_key_pair.deployer.key_name

  vpc_security_group_ids = [aws_security_group.web_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  user_data = <<-EOF
              #!/bin/bash
              apt-get update
              apt-get install -y ca-certificates curl gnupg git
              install -m 0755 -d /etc/apt/keyrings
              curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
              chmod a+r /etc/apt/keyrings/docker.gpg
              echo "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
              apt-get update
              apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
              usermod -aG docker ubuntu
              systemctl enable docker
              systemctl start docker
              
              # Pull the project
              su - ubuntu -c "git clone https://github.com/your-username/family-expense-management.git /home/ubuntu/app"
              su - ubuntu -c "cd /home/ubuntu/app && cp .env.example .env"
              
              # Set AWS variables automatically in .env
              sed -i "s|MINIO_ENDPOINT_URL=.*|MINIO_ENDPOINT_URL=https://s3.${var.aws_region}.amazonaws.com|" /home/ubuntu/app/.env
              sed -i "s|MINIO_BUCKET_NAME=.*|MINIO_BUCKET_NAME=${aws_s3_bucket.receipts.bucket}|" /home/ubuntu/app/.env
              
              # Bring up docker-compose
              su - ubuntu -c "cd /home/ubuntu/app && docker compose pull && docker compose up -d"
              EOF

  tags = {
    Name = "${var.project_name}-app-server"
  }
}

output "server_public_ip" {
  value = aws_instance.app_server.public_ip
}

output "frontend_bucket_url" {
  value = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

output "ssh_private_key" {
  value     = tls_private_key.ssh_key.private_key_pem
  sensitive = true
}
