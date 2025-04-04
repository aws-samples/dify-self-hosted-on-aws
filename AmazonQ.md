# Dify Self-Hosted on AWS - Development Guidelines

This repository contains AWS CDK code for deploying Dify on AWS. Below are the guidelines for contributing to this project.

## Project Overview

Dify Self-Hosted on AWS is an implementation that allows you to deploy the Dify platform (an LLM application development platform) on your AWS infrastructure using CDK. The deployment is fully automated and includes all necessary resources.

## Pull Request Guidelines

- PRs should be written in English
- Always include `closes #issueNo` in your PR description to automatically link and close the associated issue
- Provide a clear description of the changes made
- Make sure all tests pass before submitting

## Code Quality

- Run `npm run format` before committing to ensure code is properly formatted with Prettier
- Follow the existing code style and patterns
- Include appropriate comments for complex logic

## Testing

- To update CDK snapshot tests: `npm run test -- -u`
- Ensure all tests pass locally before submitting a PR
- Add new tests for new functionality

## Issue Guidelines

- Create issues in English
- Provide clear reproduction steps for bugs
- For feature requests, clearly explain the use case and benefits

## Deployment

- Follow the instructions in the README for deployment
- Test all changes in a development environment before deploying to production