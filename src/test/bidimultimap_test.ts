import 'jasmine';
import BidiMultiMap from '../bidimultimap';

describe('BidiMultiMap', () => {
  let map: BidiMultiMap<string, number>;

  beforeEach(() => {
    map = new BidiMultiMap();
  });

  describe('#link()', () => {
    it('should associate two objects in both directions', () => {
      map.link('abc', 123);
      expect(map.getA('abc')).toEqual([123]);
      expect(map.getB(123)).toEqual(['abc']);
    });
    it('should link multiple objects in both directions', () => {
      map.link('abc', 123);

      map.link('abc', 456);
      map.link('abc', 789);

      map.link('def', 123);
      map.link('ghi', 123);

      expect(map.getA('abc')).toEqual([123, 456, 789]);
      expect(map.getB(123)).toEqual(['abc', 'def', 'ghi']);
    });
  });

  describe('#unlink()', () => {
    it('should remove the association between two objects', () => {
      map.link('abc', 123);

      expect(map.getA('abc')).toEqual([123]);
      expect(map.getB(123)).toEqual(['abc']);

      map.unlink('abc', 123);

      expect(map.containsA('abc')).toBe(false);
      expect(map.containsB(123)).toBe(false);
    });
    it('shouldn\'t remove objects with other remaining links', () => {
      map.link('abc', 123);

      map.link('abc', 456);
      map.link('def', 123);

      expect(map.getA('abc')).toEqual([123, 456]);
      expect(map.getB(123)).toEqual(['abc', 'def']);

      map.unlink('abc', 123);

      expect(map.getA('abc')).toEqual([456]);
      expect(map.getB(123)).toEqual(['def']);
    });
  });

  describe('#deleteA()', () => {
    it('should remove the object in question and all its links', () => {
      map.link('abc', 123);
      map.link('abc', 456);
      map.link('abc', 789);

      expect(map.getA('abc')).toEqual([123, 456, 789]);

      map.deleteA('abc');

      expect(map.containsA('abc')).toBe(false);
      expect(map.containsB(123)).toBe(false);
      expect(map.containsB(456)).toBe(false);
      expect(map.containsB(789)).toBe(false);
    });
    it('should only remove Bs exclusively linked to A', () => {
      map.link('abc', 123);
      map.link('def', 123);

      map.deleteA('abc');

      expect(map.containsA('abc')).toBe(false);
      expect(map.getB(123)).toEqual(['def']);
    });
    it('should fail to delete unknown objects', () => {
      expect(() => map.deleteA('abc'))
          .toThrow(
              new Error('Failed to delete untracked \'A\' (abc)'));
    });
  });

  describe('#deleteB()', () => {
    it('should remove the object in question and all its links', () => {
      map.link('abc', 123);
      map.link('def', 123);
      map.link('ghi', 123);

      expect(map.getB(123)).toEqual(['abc', 'def', 'ghi']);

      map.deleteB(123);

      expect(map.containsB(123)).toBe(false);
      expect(map.containsA('abc')).toBe(false);
      expect(map.containsA('def')).toBe(false);
      expect(map.containsA('ghi')).toBe(false);
    });
    it('should only remove As exclusively linked to B', () => {
      map.link('abc', 123);
      map.link('abc', 456);

      map.deleteB(123);

      expect(map.containsB(123)).toBe(false);
      expect(map.getA('abc')).toEqual([456]);
    });
    it('should fail to delete unknown objects', () => {
      expect(() => map.deleteB(123))
          .toThrow(
              new Error('Failed to delete untracked \'B\' (123)'));
    });
  });

  describe('#getA()', () => {
    it('should throw an error for non-existent objects', () => {
      expect(() => map.getA('abc'))
          .toThrow(new Error('No such \'A\' element (abc)'));
    });
  });

  describe('#getB()', () => {
    it('should throw an error for non-existent objects', () => {
      expect(() => map.getB(123))
          .toThrow(new Error('No such \'B\' element (123)'));
    });
  });
});
