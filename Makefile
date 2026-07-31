.PHONY: help check test unit functional e2e lint phpstan cs fix rector typecheck javascript assets ci clean

.DEFAULT_GOAL := help

RUNTESTS = Build/Scripts/runTests.sh

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

check: lint cs phpstan rector typecheck assets ## Run quality checks

test: unit functional javascript ## Run PHP and JavaScript tests

unit: ## Run PHPUnit unit tests
	$(RUNTESTS) -s unit

functional: ## Run TYPO3 functional tests with SQLite
	$(RUNTESTS) -s functional

e2e: ## Run Playwright tests against TYPO3_BASE_URL
	$(RUNTESTS) -s e2e

lint: ## Check PHP syntax
	$(RUNTESTS) -s lint

phpstan: ## Run PHPStan
	$(RUNTESTS) -s phpstan

cs: ## Check PHP code style
	$(RUNTESTS) -s cgl

fix: ## Fix PHP code style
	$(RUNTESTS) -s cgl:fix

rector: ## Run Rector in dry-run mode
	$(RUNTESTS) -s rector

typecheck: ## Type-check browser sources
	npm run typecheck

javascript: ## Run browser unit tests
	npm run test:js

assets: ## Rebuild and verify committed browser assets
	$(RUNTESTS) -s assets

ci: ## Run the complete local CI suite
	$(RUNTESTS) -s ci

clean: ## Remove generated test output
	$(RUNTESTS) -s clean
