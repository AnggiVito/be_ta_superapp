/**
 * Room lab category values and display labels.
 */

export const ROOM_CATEGORIES = ['class_lab', 'computer_lab', 'exam_lab'];

export const ROOM_CATEGORY_LABELS = {
  class_lab: 'Class Lab',
  computer_lab: 'Computer Lab',
  exam_lab: 'Exam Lab',
};

export function isValidRoomCategory(value) {
  return value == null || ROOM_CATEGORIES.includes(value);
}
