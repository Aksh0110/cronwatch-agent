import { CompiledRule } from './cron-registry';

export class RuleEvaluator {
  /**
   * Evaluates rules for the matched job in the configured order.
   * Returns the first matching rule or null.
   */
  public evaluateRules(line: string, rules: CompiledRule[]): CompiledRule | null {
    for (const rule of rules) {
      if (rule.type === 'contains') {
        if (line.includes(rule.pattern)) {
          return rule;
        }
      } else if (rule.type === 'regex' && rule.regex) {
        if (rule.regex.test(line)) {
          return rule;
        }
      }
    }
    return null;
  }
}
