<script lang="ts">
  let { color = undefined, isFilled }: { color?: string; isFilled: boolean } =
    $props();
</script>

<svg
  class="dot"
  style={color ? `color:${color}` : undefined}
  viewBox="0 0 6 6"
  xmlns="http://www.w3.org/2000/svg"
>
  <circle
    stroke="{!isFilled ? 'currentColor' : 'none'}"
    fill="{isFilled ? 'currentColor' : 'none'}"
    cx="3"
    cy="3"
    r="2"></circle>
</svg>

<style>
  .dot {
    display: inline-block;
    height: 6px;
    width: 6px;
    margin: 0 1px;
  }
</style>
