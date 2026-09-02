import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { CircuitBreaker } from './circuit.ts';

describe('CircuitBreaker', () => {
  test('trips only after threshold consecutive failures', () => {
    const b = new CircuitBreaker(3);
    b.failure();
    b.failure();
    assert.equal(b.tripped, false);
    b.failure();
    assert.equal(b.tripped, true);
  });

  test('a success resets the consecutive run', () => {
    const b = new CircuitBreaker(3);
    b.failure();
    b.failure();
    b.success();
    b.failure();
    b.failure();
    assert.equal(b.tripped, false, 'scattered failures must not trip a long crawl');
    assert.equal(b.consecutive, 2);
  });

  test('total counts every failure, including ones a success reset', () => {
    const b = new CircuitBreaker(10);
    b.failure();
    b.success();
    b.failure();
    assert.equal(b.total, 2);
    assert.equal(b.consecutive, 1);
  });

  test('rejects a threshold below 1', () => {
    assert.throws(() => new CircuitBreaker(0), RangeError);
  });
});
