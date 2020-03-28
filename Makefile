.DEFAULT_GOAL := help

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' Makefile | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

.clasp.json:
	make login
	clasp create --title slack_echo_bot --type webapp --rootDir ./src

.PHONY: login
login: ## Google login
login:
	clasp login

.PHONY: push
push: ## Push Google apps scripts
push: .clasp.json
	clasp push

.PHONY: deploy
deploy: ## Deploy Google apps scripts
deploy: .clasp.json
	clasp deploy

.PHONY: open
open: ## Open Google apps scripts
open: .clasp.json
	clasp open

.PHONY: application
application: ## Open web application
application: .clasp.json
	clasp open --webapp

.PHONY: pull
pull: ## Pull Google apps scripts
pull: .clasp.json
	clasp pull

.PHONY: lint
lint: ## Run tslint
lint:
	tslint --fix src/*.ts

.PHONY: undeploy
undeploy: ## all undeploy Google apps scripts
undeploy:
	clasp deployments | grep -e "@[0-9]" | cut -d" " -f2 | xargs -I{} clasp undeploy {}
